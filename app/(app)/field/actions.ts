"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { getActiveCampaign } from "@/lib/campaign";
import type { RouteStop } from "@/app/(app)/canvassing/actions";

export type FieldTurf = {
  id: string;
  name: string;
  status: string;
  doorCount: number;
  route: RouteStop[];
};

/**
 * Returns all turfs assigned to the current user (via their membership in the
 * active campaign's org) that have a generated walking route.
 */
export async function getFieldTurfs(): Promise<FieldTurf[]> {
  const campaign = await getActiveCampaign();
  if (!campaign) return [];

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  // Find this user's membership in the campaign's org.
  const { data: membership } = await supabase
    .from("memberships")
    .select("id")
    .eq("org_id", campaign.org_id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!membership) return [];

  const { data, error } = await supabase
    .from("turfs")
    .select("id, name, status, door_count, route")
    .eq("campaign_id", campaign.id)
    .eq("assignee_id", membership.id)
    .not("route", "is", null)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("getFieldTurfs:", error.message);
    return [];
  }

  return ((data ?? []) as Array<{
    id: string;
    name: string;
    status: string;
    door_count: number | null;
    route: RouteStop[] | null;
  }>)
    .filter((t) => Array.isArray(t.route) && t.route.length > 0)
    .map((t) => ({
      id: t.id,
      name: t.name,
      status: t.status,
      doorCount: t.door_count ?? 0,
      route: t.route as RouteStop[],
    }));
}

/**
 * Log a door-knock contact for the current canvasser. voter_id is null (Phase 2
 * will add voter linking). The turfId and stopAddress are stored as notes context.
 */
export async function logDoorContact(params: {
  turfId: string;
  stopAddress: string;
  result: string;
  support: number | null;
  notes: string;
}): Promise<{ ok: boolean; error?: string }> {
  const campaign = await getActiveCampaign();
  if (!campaign) return { ok: false, error: "No active campaign" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in" };

  const { data: membership } = await supabase
    .from("memberships")
    .select("id")
    .eq("org_id", campaign.org_id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!membership) return { ok: false, error: "No membership found" };

  const fullNotes = [
    params.notes?.trim() ?? "",
    `turf:${params.turfId}`,
    `address:${params.stopAddress}`,
  ]
    .filter(Boolean)
    .join(" | ");

  const { error } = await supabase.from("contacts").insert({
    campaign_id: campaign.id,
    voter_id: null,
    canvasser_id: membership.id,
    channel: "door",
    result: params.result,
    support: params.support,
    notes: fullNotes,
  });

  if (error) {
    console.error("logDoorContact:", error.message);
    return { ok: false, error: error.message };
  }

  revalidatePath("/field");
  return { ok: true };
}
