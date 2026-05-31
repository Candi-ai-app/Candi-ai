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

export async function saveTurf(geometry: GeoPolygon): Promise<{ ok: boolean }> {
  const campaignId = await getActiveCampaignId();
  if (!campaignId) return { ok: false };
  const supabase = await createClient();
  const { error } = await supabase.rpc("create_turf", {
    p_campaign: campaignId,
    p_geojson: geometry,
  });
  if (error) {
    console.error("saveTurf:", error.message);
    return { ok: false };
  }
  return { ok: true };
}
