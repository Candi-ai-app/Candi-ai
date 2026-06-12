"use server";

import { createClient } from "@/utils/supabase/server";
import { seedDemoCampaign } from "@/lib/onboarding/seed-demo";

const PROTECTED_ORGS = new Set([
  "00000000-0000-0000-0000-000000000001",
  "00000000-0000-0000-0000-000000000002",
]);

export type SeedStatus =
  | { status: "seeded"; campaignId: string; voterCount: number; turfCount: number; contactCount: number }
  | { status: "existing"; campaignId: string }
  | { status: "no_personal_org" }
  | { status: "error"; message: string };

/**
 * Checks whether the signed-in user's personal org needs seeding, and seeds
 * if so. Returns the resulting campaign id for immediate redirect.
 *
 * "Personal org" = the org the user owns that is NOT one of the shared demo
 * orgs. If the user owns multiple orgs we pick the first one created (the
 * personal one created at sign-up).
 */
export async function maybeBootstrapDemoOrg(): Promise<SeedStatus> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { status: "error", message: "Not authenticated" };

  // Find the user's personal org: one they own/direct that isn't a shared demo.
  const { data: memberships } = await supabase
    .from("memberships")
    .select("id, org_id, role, created_at")
    .eq("user_id", user.id)
    .in("role", ["owner", "director"])
    .order("created_at", { ascending: true });

  const personalMembership = (memberships ?? []).find(
    (m) => !PROTECTED_ORGS.has(m.org_id as string)
  );

  if (!personalMembership) return { status: "no_personal_org" };

  const orgId = personalMembership.org_id as string;

  // Check whether the org already has campaigns — idempotency gate.
  const { count } = await supabase
    .from("campaigns")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId);  // RLS scopes to user's orgs — this is safe

  // Wait — RLS scopes campaigns by membership but we need to confirm count is for THIS org.
  // The above select doesn't filter by org_id without explicit where.
  // Actually: RLS returns ALL campaigns the user has access to across all orgs.
  // We need to scope the count to personalMembership.org_id specifically.
  // The above already has .eq("org_id", orgId) so it's correct.

  if (count && count > 0) {
    // Already has campaigns in this org — find the first one.
    const { data: existing } = await supabase
      .from("campaigns")
      .select("id")
      .eq("org_id", orgId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (existing) return { status: "existing", campaignId: existing.id as string };
    // Fallback — user has campaigns we can't see; let the normal select flow handle it.
    return { status: "no_personal_org" };
  }

  // Org is empty — run the seed.
  try {
    const result = await seedDemoCampaign(orgId);
    return {
      status: "seeded",
      campaignId: result.campaignId,
      voterCount: result.voterCount,
      turfCount: result.turfCount,
      contactCount: result.contactCount,
    };
  } catch (e) {
    console.error("maybeBootstrapDemoOrg:", e);
    return { status: "error", message: (e as Error).message };
  }
}
