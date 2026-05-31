"use server";

import { createClient } from "@/utils/supabase/server";
import { getActiveCampaignId } from "@/lib/campaign";

export type GeoPolygon = { type: "Polygon"; coordinates: number[][][] };

export type SavedTurf = {
  id: string;
  name: string;
  status: string;
  voter_count: number;
  door_count: number;
  boundary: GeoPolygon;
};

/** One plottable voter for the turf map (from the voter_points RPC). */
export type VoterPoint = {
  external_id: string;
  lng: number;
  lat: number;
  party: "D" | "R" | "I" | null;
  support: number | null;
  precinct: string | null;
  address: string | null;
  race: string | null;
  gender: string | null;
  flags: string[] | null;
  /** Per-election history map, e.g. { "2024G": true, "2022G": false, ... }. */
  history: Record<string, boolean> | null;
};

export async function listTurfs(): Promise<SavedTurf[]> {
  const campaignId = await getActiveCampaignId();
  if (!campaignId) return [];
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_turfs", { p_campaign: campaignId });
  if (error) {
    console.error("listTurfs:", error.message);
    return [];
  }
  return (data ?? []) as SavedTurf[];
}

/**
 * Geocoded voters for the active campaign, as map points. RLS-scoped: the
 * voter_points RPC is security-definer but only returns rows for campaigns the
 * signed-in user belongs to (user_campaign_ids check). Empty campaigns → [].
 */
export async function listVoterPoints(): Promise<VoterPoint[]> {
  const campaignId = await getActiveCampaignId();
  if (!campaignId) return [];
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("voter_points", { p_campaign: campaignId });
  if (error) {
    console.error("listVoterPoints:", error.message);
    return [];
  }
  return (data ?? []) as VoterPoint[];
}

/**
 * Persist a drawn turf. `counts` carries the client-computed doors-vs-people for
 * the voters inside the polygon under the active filter; they are stored verbatim
 * on the turf. Omitting them falls back to a server-side count (legacy shape).
 */
export async function saveTurf(
  geometry: GeoPolygon,
  counts?: { voterCount?: number; doorCount?: number }
): Promise<{ ok: boolean }> {
  const campaignId = await getActiveCampaignId();
  if (!campaignId) return { ok: false };
  const supabase = await createClient();
  const { error } = await supabase.rpc("create_turf", {
    p_campaign: campaignId,
    p_geojson: geometry,
    p_voter_count: counts?.voterCount ?? null,
    p_door_count: counts?.doorCount ?? null,
  });
  if (error) {
    console.error("saveTurf:", error.message);
    return { ok: false };
  }
  return { ok: true };
}
