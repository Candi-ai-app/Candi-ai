import { createClient } from "@/utils/supabase/server";

const RANK: Record<string, number> = { owner: 3, director: 2, canvasser: 1 };

/**
 * Highest-privilege role across a user's memberships. A user can belong to
 * MULTIPLE orgs (e.g. the demo org + a real campaign's org), so we must not
 * assume a single membership row — `.maybeSingle()` errors on 2+ rows and
 * silently drops the user to "canvasser". Pass rows you already fetched, or use getRole().
 */
export function highestRole(rows: { role: string | null }[] | null | undefined): string {
  let best = "canvasser";
  for (const r of rows ?? []) {
    const role = r.role ?? "";
    if ((RANK[role] ?? 0) > (RANK[best] ?? 0)) best = role;
  }
  return best;
}

/**
 * Current signed-in user's role. Defaults to "canvasser".
 *
 * Pass a `scope` to get the org-SCOPED role — the user's role in THAT org only —
 * which is what permission/UI gating must use in the consultant model (a user
 * can be owner in org A but canvasser in org B; their owner powers must not leak
 * into B). `scope` accepts either an `orgId` directly or a `campaignId` (resolved
 * to its org_id via RLS-scoped lookup). If the user has no membership in that
 * org, the role is "canvasser" (least privilege).
 *
 * With NO scope, returns the highest role across ALL the user's orgs. This
 * unscoped path remains only for callers that legitimately have no single org in
 * context — e.g. the /select picker deciding whether to show "create campaign"
 * at all. It is safe because RLS still gates every data read/write; getRole is
 * defense-in-depth on the UI/permission layer, not the sole gate. Prefer passing
 * a scope whenever a campaign or org is in context.
 */
export async function getRole(
  scope?: { orgId?: string | null; campaignId?: string | null } | null
): Promise<string> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return "canvasser";

  // Resolve a campaignId to its org_id (RLS scopes this to campaigns the user
  // can access). An unresolvable campaign → no org → least privilege.
  let orgId = scope?.orgId ?? null;
  if (!orgId && scope?.campaignId) {
    const { data: campaign } = await supabase
      .from("campaigns")
      .select("org_id")
      .eq("id", scope.campaignId)
      .maybeSingle();
    orgId = (campaign?.org_id as string | undefined) ?? null;
    if (!orgId) return "canvasser";
  }

  // Org-scoped: the user's role IN THIS ORG only. maybeSingle() is correct here
  // because (user_id, org_id) is unique — one membership row per org per user.
  if (orgId) {
    const { data } = await supabase
      .from("memberships")
      .select("role")
      .eq("user_id", user.id)
      .eq("org_id", orgId)
      .maybeSingle();
    return (data?.role as string | undefined) ?? "canvasser";
  }

  // Unscoped (no org in context): highest role across all the user's orgs.
  const { data } = await supabase.from("memberships").select("role").eq("user_id", user.id);
  return highestRole(data);
}

/** Owners and directors get the full admin surface; canvassers are field-only. */
export function isAdminRole(role: string): boolean {
  return role === "owner" || role === "director";
}
