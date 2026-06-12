"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { getActiveCampaign, type ActiveCampaign } from "@/lib/campaign";
import { isAdminRole } from "@/lib/auth";

// The concrete RLS client type, inferred so this file stays in lockstep with
// whatever @supabase/ssr returns (same pattern as app/select/actions.ts).
type DbClient = Awaited<ReturnType<typeof createClient>>;

// ── Types ─────────────────────────────────────────────────────────────────────

export type TeamMember = {
  /** memberships.id */
  membershipId: string;
  name: string;
  email: string;
  role: string;
  /** memberships.created_at */
  joinedAt: string;
  /** This row is the signed-in caller. */
  isYou: boolean;
};

export type PendingInvite = {
  /** invites.id */
  id: string;
  email: string;
  role: string;
  /** invites.created_at */
  sentAt: string;
  /**
   * true  → the invite email went out (auth account created, awaiting their
   *         first sign-in via the emailed link);
   * false → the invite row exists but the email step didn't complete
   *         (e.g. SMTP failure) — revoke and retry.
   */
  emailSent: boolean;
};

export type TeamData = {
  members: TeamMember[];
  invites: PendingInvite[];
  /** Caller's role in the ACTIVE campaign's org (org-scoped, least privilege). */
  yourRole: string;
  /** The org (workspace) name, for the page header. */
  orgName: string;
};

export type InviteResult =
  | {
      ok: true;
      /**
       * "invited"        → invite email sent, they'll set a password via the link;
       * "added-directly" → they already had a Candi account, membership granted
       *                    immediately (inviteUserByEmail refuses existing emails).
       */
      status: "invited" | "added-directly";
      email: string;
      /** Set when the invite was recorded but email delivery is unconfirmed. */
      warning?: string;
    }
  | { ok: false; error: string };

// ── Local helpers ─────────────────────────────────────────────────────────────

/** "diego.reyes@candi.app" → "Diego Reyes" (display-only, canvassing pattern). */
function emailToName(email: string): string | null {
  const local = (email.split("@")[0] ?? "").trim();
  if (!local) return null;
  return local
    .split(/[._-]+/)
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
}

/**
 * The caller's role IN this org only — org-scoped like roleInCampaignOrg in
 * app/select/actions.ts (not exported there, so the small query is duplicated):
 * an owner of org A must not get team-admin powers over org B. Missing
 * membership → "canvasser" (least privilege). RLS independently scopes reads.
 */
async function roleInOrg(supabase: DbClient, userId: string, orgId: string): Promise<string> {
  const { data } = await supabase
    .from("memberships")
    .select("role")
    .eq("user_id", userId)
    .eq("org_id", orgId)
    .maybeSingle();
  return (data?.role as string | undefined) ?? "canvasser";
}

/**
 * Resolve the signed-in user + active campaign and verify they are an
 * owner/director of THAT campaign's org. Every team action funnels through
 * this — the invites table has no client write policies, so these service-role
 * writes are the only path, and this check is what makes them safe.
 */
async function requireOrgAdmin(): Promise<
  | { ok: true; userId: string; campaign: ActiveCampaign }
  | { ok: false; error: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const campaign = await getActiveCampaign();
  if (!campaign) return { ok: false, error: "No active campaign selected." };

  const role = await roleInOrg(supabase, user.id, campaign.org_id);
  if (!isAdminRole(role)) {
    return { ok: false, error: "Only owners and directors can manage the team." };
  }
  return { ok: true, userId: user.id, campaign };
}

/** Where the Supabase invite email lands (must be in the dashboard redirect allowlist). */
function inviteRedirectUrl(): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3007").replace(/\/+$/, "");
  return `${base}/invite`;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// ── Actions ───────────────────────────────────────────────────────────────────

/**
 * Members of the active org + its pending invites. Memberships and invites are
 * read through the RLS client (the invites SELECT policy is admin-only);
 * emails come from the trusted admin client purely for display, the same way
 * canvassing resolves assignee names.
 */
export async function listTeam(): Promise<TeamData> {
  const empty: TeamData = { members: [], invites: [], yourRole: "canvasser", orgName: "" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return empty;

  const campaign = await getActiveCampaign();
  if (!campaign) return empty;

  const yourRole = await roleInOrg(supabase, user.id, campaign.org_id);
  if (!isAdminRole(yourRole)) return { ...empty, yourRole };

  const [orgRes, membersRes, invitesRes] = await Promise.all([
    supabase.from("orgs").select("name").eq("id", campaign.org_id).maybeSingle(),
    supabase
      .from("memberships")
      .select("id, user_id, role, created_at")
      .eq("org_id", campaign.org_id)
      .order("created_at", { ascending: true })
      .limit(1000),
    // Admin-only via RLS (invites_select_admin). Accepted rows are kept too:
    // an accepted invite whose user never signed in still reads as "pending"
    // to the admin (the auth account is created at SEND time by the trigger).
    supabase
      .from("invites")
      .select("id, email, role, created_at, accepted_at")
      .eq("org_id", campaign.org_id)
      .is("revoked_at", null)
      .order("created_at", { ascending: false })
      .limit(1000),
  ]);

  type MemberRow = { id: string; user_id: string; role: string; created_at: string };
  type InviteRow = { id: string; email: string; role: string; created_at: string; accepted_at: string | null };
  const memberRows = (membersRes.data ?? []) as MemberRow[];
  const inviteRows = (invitesRes.data ?? []) as InviteRow[];

  // Resolve auth details per member (email + whether they ever signed in).
  const authById = new Map<string, { email: string; invitedAt: string | null; lastSignInAt: string | null }>();
  if (memberRows.length > 0) {
    try {
      const admin = createAdminClient();
      await Promise.all(
        memberRows.map(async (m) => {
          const { data } = await admin.auth.admin.getUserById(m.user_id);
          authById.set(m.user_id, {
            email: data?.user?.email ?? "",
            invitedAt: data?.user?.invited_at ?? null,
            lastSignInAt: data?.user?.last_sign_in_at ?? null,
          });
        })
      );
    } catch {
      /* email lookup unavailable — rows fall back to placeholders */
    }
  }

  const inviteByEmail = new Map(inviteRows.map((i) => [i.email.toLowerCase(), i]));
  const members: TeamMember[] = [];
  const invites: PendingInvite[] = [];
  const consumedInviteIds = new Set<string>();

  for (const m of memberRows) {
    const auth = authById.get(m.user_id);
    const email = auth?.email ?? "";
    const inv = email ? inviteByEmail.get(email.toLowerCase()) : undefined;
    // Invited, account auto-created at send time, never signed in → still a
    // PENDING invite from the admin's point of view, not a member.
    if (inv && inv.accepted_at && auth?.invitedAt && !auth?.lastSignInAt) {
      invites.push({ id: inv.id, email: inv.email, role: m.role, sentAt: inv.created_at, emailSent: true });
      consumedInviteIds.add(inv.id);
      continue;
    }
    members.push({
      membershipId: m.id,
      name: emailToName(email) ?? "Member",
      email,
      role: m.role,
      joinedAt: m.created_at,
      isYou: m.user_id === user.id,
    });
  }

  // Invite rows that never got as far as creating the account (email failed).
  for (const i of inviteRows) {
    if (i.accepted_at === null && !consumedInviteIds.has(i.id)) {
      invites.push({ id: i.id, email: i.email, role: i.role, sentAt: i.created_at, emailSent: false });
    }
  }
  invites.sort((a, b) => (a.sentAt < b.sentAt ? 1 : -1));

  return {
    members,
    invites,
    yourRole,
    orgName: ((orgRes.data as { name?: string } | null)?.name ?? "").trim(),
  };
}

/**
 * Invite a teammate into the ACTIVE campaign's org. Org-admin gated. The invite
 * row (service role — clients cannot write invites) is the single source of
 * authority the signup trigger validates against; the email itself goes out via
 * supabase.auth.admin.inviteUserByEmail. Existing accounts are granted the
 * membership immediately instead (the invite API refuses known emails).
 */
export async function inviteMember(input: { email: string; role: string }): Promise<InviteResult> {
  const gate = await requireOrgAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  const { userId, campaign } = gate;

  const email = String(input?.email ?? "").trim().toLowerCase();
  const role = String(input?.role ?? "");
  if (!EMAIL_RE.test(email)) return { ok: false, error: "Enter a valid email address." };
  if (role !== "director" && role !== "canvasser") {
    return { ok: false, error: "Choose a role: director or canvasser." };
  }

  const admin = createAdminClient();

  // Already a member? (resolve member emails the same way the list does)
  const { data: memberRows } = await admin
    .from("memberships")
    .select("user_id")
    .eq("org_id", campaign.org_id)
    .limit(1000);
  for (const m of (memberRows ?? []) as { user_id: string }[]) {
    const { data } = await admin.auth.admin.getUserById(m.user_id);
    if ((data?.user?.email ?? "").toLowerCase() === email) {
      return { ok: false, error: `${email} is already a member of this workspace.` };
    }
  }

  // One live invite per email per org (the DB partial unique index backs this).
  const { data: existing } = await admin
    .from("invites")
    .select("id")
    .eq("org_id", campaign.org_id)
    .eq("email", email)
    .is("accepted_at", null)
    .is("revoked_at", null)
    .maybeSingle();
  if (existing) return { ok: false, error: `${email} already has a pending invite.` };

  const { data: created, error: insErr } = await admin
    .from("invites")
    .insert({ org_id: campaign.org_id, email, role, invited_by: userId })
    .select("id")
    .single();
  if (insErr || !created) {
    if (insErr?.code === "23505") {
      return { ok: false, error: `${email} already has a pending invite.` };
    }
    console.error("inviteMember insert:", insErr?.message);
    return { ok: false, error: "Couldn't save the invite — try again." };
  }
  const inviteId = created.id as string;

  const { error: sendErr } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: inviteRedirectUrl(),
  });

  if (!sendErr) {
    revalidatePath("/team");
    return { ok: true, status: "invited", email };
  }

  // Existing account → grant the membership immediately (SECURITY DEFINER RPC,
  // service-role-only; we already verified the caller is an org admin above).
  const exists =
    (sendErr as { code?: string }).code === "email_exists" ||
    /already.*(registered|exists|been invited)/i.test(sendErr.message ?? "");
  if (exists) {
    const { data: rpcResult, error: rpcErr } = await admin.rpc("accept_invite_for_existing_user", {
      p_invite_id: inviteId,
    });
    if (!rpcErr && rpcResult === "ok") {
      revalidatePath("/team");
      return { ok: true, status: "added-directly", email };
    }
    console.error("inviteMember accept-existing:", rpcErr?.message ?? rpcResult);
    await admin.from("invites").delete().eq("id", inviteId);
    return { ok: false, error: "They already have an account, but adding them failed — try again." };
  }

  // Email send failed. If GoTrue still created the account, the signup trigger
  // already consumed the invite (membership granted) — surface that honestly.
  const { data: after } = await admin
    .from("invites")
    .select("accepted_at")
    .eq("id", inviteId)
    .maybeSingle();
  if ((after as { accepted_at: string | null } | null)?.accepted_at) {
    revalidatePath("/team");
    return {
      ok: true,
      status: "invited",
      email,
      warning: "email delivery unconfirmed — check the Supabase Auth SMTP settings.",
    };
  }

  // Nothing happened server-side — remove the row so a retry is clean.
  await admin.from("invites").delete().eq("id", inviteId);
  console.error("inviteMember send:", sendErr.message);
  return {
    ok: false,
    error: `Couldn't send the invite email (${sendErr.message}). Nothing was saved — check the Supabase Auth SMTP settings and retry.`,
  };
}

/**
 * Revoke a pending invite in the active org. Org-admin gated. Because the
 * invite email auto-creates the auth account (trigger grants the membership at
 * SEND time), the SECURITY DEFINER revoke_invite() also withdraws that
 * membership when the invitee has never signed in — and tells us to delete the
 * never-used auth account so the emailed link dies too.
 */
export async function revokeInvite(inviteId: string): Promise<{ ok: boolean; error?: string }> {
  const gate = await requireOrgAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  const { campaign } = gate;

  const id = String(inviteId ?? "").trim();
  if (!id) return { ok: false, error: "Invite not found." };

  const admin = createAdminClient();

  // The invite must belong to the ACTIVE org — no cross-org revocation.
  const { data: inv } = await admin
    .from("invites")
    .select("id, org_id")
    .eq("id", id)
    .maybeSingle();
  if (!inv || (inv as { org_id: string }).org_id !== campaign.org_id) {
    return { ok: false, error: "Invite not found." };
  }

  const { data: result, error } = await admin.rpc("revoke_invite", { p_invite_id: id });
  if (error) {
    console.error("revokeInvite:", error.message);
    return { ok: false, error: "Couldn't revoke the invite — try again." };
  }

  const sentinel = String(result ?? "");
  if (sentinel.startsWith("delete-auth-user:")) {
    // Invite-created account, never signed in, no memberships left anywhere →
    // delete it via the supported admin API so the emailed link stops working.
    const orphanId = sentinel.slice("delete-auth-user:".length);
    const { error: delErr } = await admin.auth.admin.deleteUser(orphanId);
    if (delErr) console.error("revokeInvite deleteUser:", delErr.message); // membership already gone — not fatal
  } else if (sentinel === "not-found") {
    return { ok: false, error: "Invite not found." };
  }

  revalidatePath("/team");
  return { ok: true };
}
