"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { CAMPAIGN_COOKIE } from "@/lib/campaign";
import { isAdminRole } from "@/lib/auth";
import { findArea, stateAbbr, SAMPLE_VOTER_COUNT } from "@/lib/areas";

// The concrete client type, inferred from createClient() so the helper below
// stays in lockstep with whatever @supabase/ssr returns (no hand-written generics).
type DbClient = Awaited<ReturnType<typeof createClient>>;

const COOKIE_OPTS = {
  httpOnly: true as const,
  sameSite: "lax" as const,
  path: "/",
  secure: process.env.NODE_ENV === "production",
  // ~1 year — long-lived selection; cleared on sign-out.
  maxAge: 60 * 60 * 24 * 365,
};

/**
 * The signed-in user's role IN THE ORG that owns `campaignId` — the org-scoped
 * permission check the consultant model requires. A user who is owner in org A
 * but only a canvasser in org B must NOT get owner powers over org B's
 * campaigns, so we resolve the campaign's own org and read the user's membership
 * THERE — never their highest role across all orgs.
 *
 * Returns "canvasser" (least privilege) when the campaign can't be read (RLS:
 * the user isn't in its org) or the user has no membership row in that org.
 * Defense-in-depth: RLS independently scopes the subsequent write.
 */
async function roleInCampaignOrg(
  supabase: DbClient,
  userId: string,
  campaignId: string
): Promise<string> {
  const { data: campaign } = await supabase
    .from("campaigns")
    .select("org_id")
    .eq("id", campaignId)
    .maybeSingle();
  const orgId = (campaign?.org_id as string | undefined) ?? null;
  if (!orgId) return "canvasser";

  // (user_id, org_id) is unique → at most one row; maybeSingle() is exact.
  const { data: membership } = await supabase
    .from("memberships")
    .select("role")
    .eq("user_id", userId)
    .eq("org_id", orgId)
    .maybeSingle();
  return (membership?.role as string | undefined) ?? "canvasser";
}

/** Select a campaign the user can access and make it active. */
export async function selectCampaign(id: string) {
  const supabase = await createClient();

  // RLS-scoped: only returns the row if the user is a member of its org.
  const { data: campaign } = await supabase
    .from("campaigns")
    .select("id")
    .eq("id", id)
    .maybeSingle();

  if (!campaign) redirect("/select");

  const c = await cookies();
  c.set(CAMPAIGN_COOKIE, campaign.id as string, COOKIE_OPTS);
  redirect("/");
}

/**
 * Permanently delete a campaign (owners/directors only). RLS already scopes the
 * delete to the user's orgs; we additionally gate on role so canvassers can't
 * trigger it. Voters/turfs/contacts cascade away with the campaign. If the
 * deleted campaign was the active one, the selection cookie is cleared.
 */
export async function deleteCampaign(id: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Owners/directors only, scoped to the TARGET campaign's org. A user can be
  // owner in one org and canvasser in another, so we must check their role in
  // THIS campaign's org — not their highest role anywhere. Fetch the campaign
  // first (RLS scopes to the user's orgs) to learn its org_id; a missing row
  // (no access) denies.
  const role = await roleInCampaignOrg(supabase, user.id, id);
  if (!isAdminRole(role)) {
    revalidatePath("/select");
    return;
  }

  // RLS limits this to campaigns in the user's orgs; cascade removes children.
  const { error } = await supabase.from("campaigns").delete().eq("id", id);
  if (error) {
    console.error("deleteCampaign:", error.message);
    revalidatePath("/select");
    return;
  }

  // If we just deleted the active campaign, drop the selection cookie so the
  // app doesn't try to load a campaign that no longer exists.
  const c = await cookies();
  if (c.get(CAMPAIGN_COOKIE)?.value === id) c.delete(CAMPAIGN_COOKIE);

  revalidatePath("/select");
}

/**
 * Update an existing campaign's editable fields (name, office, district, date,
 * photo). Owners/directors only. Called from the edit modal on campaign cards.
 */
export async function updateCampaign(
  id: string,
  fields: {
    candidate?: string;
    office?: string | null;
    district?: string | null;
    election_date?: string | null;
    photo_url?: string | null;
  }
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in" };

  // Org-scoped role check against the TARGET campaign's org (see deleteCampaign).
  // Owner-in-another-org does NOT grant edit rights here.
  const role = await roleInCampaignOrg(supabase, user.id, id);
  if (!isAdminRole(role)) {
    return { ok: false, error: "Not authorised" };
  }

  const update: Record<string, unknown> = {};
  if (fields.candidate !== undefined) update.candidate = fields.candidate || null;
  if (fields.office !== undefined) update.office = fields.office || null;
  if (fields.district !== undefined) update.district = fields.district || null;
  if (fields.election_date !== undefined) update.election_date = fields.election_date || null;
  if (fields.photo_url !== undefined) update.photo_url = fields.photo_url || null;

  const { error } = await supabase
    .from("campaigns")
    .update(update)
    .eq("id", id);

  if (error) {
    console.error("updateCampaign:", error.message);
    return { ok: false, error: error.message };
  }
  revalidatePath("/select");
  return { ok: true };
}

/**
 * Create a new campaign — or finish setting up an existing draft when `id` is
 * provided (resume flow). Owners/directors only. Seeds a realistic sample voter
 * set scoped to the chosen area (only if the campaign has none yet), makes it
 * active, and goes to the dashboard.
 */
export async function createCampaign(
  formData: FormData,
  orgId?: string
): Promise<void | { ok: false; error: string }> {
  const id = String(formData.get("id") ?? "").trim(); // present → resume/update
  const candidate = String(formData.get("candidate") ?? "").trim();
  const office = String(formData.get("office") ?? "").trim();
  const state = String(formData.get("state") ?? "").trim();
  const county = String(formData.get("county") ?? "").trim();
  const district = String(formData.get("district") ?? "").trim();
  const electionDate = String(formData.get("election_date") ?? "").trim();
  const photoUrl = String(formData.get("photo_url") ?? "").trim();
  // Allow the chosen org to arrive either as an argument or in the form, so a
  // future workspace picker can submit it without changing this signature.
  const chosenOrgId = (orgId ?? String(formData.get("org_id") ?? "")).trim();

  const back = id ? `/select/new?resume=${id}` : "/select/new";
  if (!candidate) redirect(back);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Only owners/directors may create campaigns. Resolve WHICH org to attach to,
  // org-scoped: fetch every org where the user is owner/director (capped — a user
  // won't be in thousands of orgs) and pick deterministically.
  const { data: eligibleOrgs } = await supabase
    .from("memberships")
    .select("org_id, role")
    .eq("user_id", user.id)
    .in("role", ["owner", "director"])
    .limit(1000);

  const eligible = (eligibleOrgs ?? []) as { org_id: string; role: string }[];
  if (eligible.length === 0) redirect("/select");

  let targetOrgId: string;
  if (chosenOrgId) {
    // An org was chosen — honor it ONLY if the user is owner/director there.
    // This is the privilege-escalation guard: a canvasser-in-org-X cannot pass
    // org X here and have a campaign created under it.
    if (!eligible.some((m) => m.org_id === chosenOrgId)) {
      return { ok: false, error: "Not authorised for that workspace" };
    }
    targetOrgId = chosenOrgId;
  } else if (eligible.length === 1) {
    // Exactly one eligible org (every current demo user + new personal-org
    // signups) — unambiguous, attach there. Unchanged behavior.
    targetOrgId = eligible[0].org_id;
  } else {
    // Multiple eligible orgs and none chosen — refuse rather than silently
    // attaching to an arbitrary one. The caller can re-submit with org_id once a
    // picker exists; today it voids the result, so the user safely stays put.
    return { ok: false, error: "Multiple workspaces — choose one" };
  }

  // Stable shape (no conditional keys) so the Supabase client types resolve
  // cleanly. photo_url is null when no photo was provided.
  const fields = {
    candidate,
    office: office || null,
    district: district || null,
    state: state || null,
    county: county || null,
    election_date: electionDate || null,
    photo_url: photoUrl || null,
  };

  let campaignId: string;

  if (id) {
    // Resume: update the existing draft in place (RLS scopes to user's orgs).
    // The Supabase client is untyped (no generated Database types), so .update()
    // infers its payload as `never`; cast the well-formed payload through unknown.
    const { data: updated, error: updErr } = await supabase
      .from("campaigns")
      .update(fields as unknown as never)
      .eq("id", id)
      .select("id")
      .single();
    if (updErr || !updated) {
      console.error("createCampaign (resume):", updErr?.message);
      redirect(back);
    }
    campaignId = updated.id as string;
  } else {
    const { data: created, error } = await supabase
      .from("campaigns")
      .insert({ org_id: targetOrgId, ...fields })
      .select("id")
      .single();
    if (error || !created) {
      console.error("createCampaign:", error?.message);
      redirect(back);
    }
    campaignId = created.id as string;
  }

  // Seed sample voters scoped to the campaign — but only if it has none yet, so
  // resuming a draft doesn't double-seed. Best-effort: a seeding hiccup
  // shouldn't strand the user on /select.
  try {
    const { count } = await supabase
      .from("voters")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", campaignId);
    if (!count) {
      const rows = buildSampleVoters(campaignId, state, county);
      // Insert in batches to stay well under payload limits.
      for (let i = 0; i < rows.length; i += 200) {
        const { error: insErr } = await supabase.from("voters").insert(rows.slice(i, i + 200));
        if (insErr) {
          console.error("createCampaign seed:", insErr.message);
          break;
        }
      }
    }
  } catch (e) {
    console.error("createCampaign seed threw:", e);
  }

  const c = await cookies();
  c.set(CAMPAIGN_COOKIE, campaignId, COOKIE_OPTS);
  redirect("/");
}

// ── Sample voter generation ───────────────────────────────────────────────────
// Deterministic per-campaign synthetic voters using the area's bbox / precincts /
// city, written straight into the live `voters` table. Uses ONLY the current
// schema columns. Generation mirrors lib/mock-data.ts (seeded PRNG, party mix,
// support/persuasion correlation, flags).

const FIRST = [
  "James", "Maria", "David", "Linda", "Andre", "Grace", "Omar", "Chloe", "Wei", "Tanya",
  "Luis", "Nadia", "Caleb", "Ruth", "Diego", "Hana", "Isaac", "Priya", "Noah", "Zara",
  "Elena", "Trent", "Maya", "Owen", "Layla", "Marcus", "Aaliyah", "Kenji", "Sofia", "Imani",
];
const LAST = [
  "Nguyen", "Carter", "Flores", "Brooks", "Patel", "Reed", "Murphy", "Cohen", "Diaz", "Walsh",
  "Okafor", "Romano", "Bauer", "Singh", "Hughes", "Lozano", "Foster", "Khan", "Berg", "Ali",
  "Tucker", "Mercer", "Vance", "Ortiz", "Hale", "Henderson", "Whitfield", "Raman", "Bell", "Park",
];
// NOTE: no synthetic fallback area. For an UNKNOWN state/county we skip seeding
// entirely (see buildSampleVoters) rather than invent "Springfield"/zip 00001
// voters, which produced geographically incoherent sample data.

function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Stable 32-bit hash so each campaign id seeds a distinct-but-deterministic set.
function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

type VoterRow = {
  campaign_id: string;
  external_id: string;
  first_name: string;
  last_name: string;
  age: number;
  party: "D" | "R" | "I";
  precinct: string;
  address: string;
  city: string;
  state: string | null;
  zip: string;
  phone: string;
  support: number;
  persuasion: number;
  vote_history: { label: string; history: Record<string, boolean> };
  flags: string[];
  race: string;
  gender: string;
  geom: string; // WKT POINT — accepted by PostGIS geometry(Point,4326) on insert.
};

function buildSampleVoters(campaignId: string, stateName: string, county: string): VoterRow[] {
  // Unknown area → no coherent geography to place voters in, so seed nothing.
  // Known FL/PA areas (lib/areas.ts) seed as before. The campaign is still
  // created; it just starts with zero sample voters.
  const area = findArea(stateName, county);
  if (!area) return [];
  const abbr = stateAbbr(stateName) || null;
  const [west, south, east, north] = area.bbox;
  const rng = mulberry32(hashSeed(campaignId));
  const pick = <T>(arr: T[]): T => arr[Math.floor(rng() * arr.length)];

  const out: VoterRow[] = [];
  for (let i = 0; i < SAMPLE_VOTER_COUNT; i++) {
    const r = rng();
    // ≈45% D / 37% R / 18% I.
    const party: "D" | "R" | "I" = r < 0.45 ? "D" : r < 0.82 ? "R" : "I";
    const support = 1 + Math.floor(rng() * 5); // 1–5
    const persuasion =
      support === 3
        ? 3 + Math.floor(rng() * 3)
        : support <= 2 || support >= 5
          ? Math.floor(rng() * 2)
          : 1 + Math.floor(rng() * 3); // 0–5, correlated with support

    const flags: string[] = [];
    if (persuasion >= 4) flags.push("persuadable");
    if (rng() < 0.06) flags.push("volunteer");
    if (rng() < 0.05) flags.push("donor");
    if (rng() < 0.07) flags.push("VBM");

    const age = 18 + Math.floor(rng() * 69); // 18–86

    // Per-election turnout (most-recent-first: 2024G, 2022G, 2020G, 2018G),
    // age-boosted so older voters vote more. Stored on vote_history.history so
    // the super-voter (N-of-M) filter works on onboarding-created campaigns.
    const boost = Math.min(age, 80) * 0.0035;
    const history: Record<string, boolean> = {
      "2024G": rng() < 0.52 + boost,
      "2022G": rng() < 0.48 + boost,
      "2020G": rng() < 0.44 + boost,
      "2018G": rng() < 0.4 + boost,
    };
    const got = Object.values(history).filter(Boolean).length;
    const label = `${Math.round((got / 4) * 100)}% (${got}/4)`;

    // Race: Broward-leaning plausible mix. Gender: M/F/X.
    const rb = rng();
    const race =
      rb < 0.38 ? "White" : rb < 0.68 ? "Black" : rb < 0.9 ? "Hispanic/Latino" : rb < 0.95 ? "Asian" : "Other";
    const gb = rng();
    const gender = gb < 0.48 ? "M" : gb < 0.97 ? "F" : "X";

    const lng = west + rng() * (east - west);
    const lat = south + rng() * (north - south);

    out.push({
      campaign_id: campaignId,
      external_id: `S-${hashSeed(campaignId).toString(36).toUpperCase()}-${100000 + i}`,
      first_name: pick(FIRST),
      last_name: pick(LAST),
      age,
      party,
      precinct: pick(area.precincts),
      address: `${100 + Math.floor(rng() * 8900)} ${pick(area.streets)}`,
      city: area.city,
      state: abbr,
      zip: pick(area.zips),
      phone: `(555) 555-0${(100 + Math.floor(rng() * 899)).toString().padStart(3, "0")}`,
      support,
      persuasion,
      vote_history: { label, history },
      flags,
      race,
      gender,
      geom: `SRID=4326;POINT(${lng.toFixed(6)} ${lat.toFixed(6)})`,
    });
  }
  return out;
}
