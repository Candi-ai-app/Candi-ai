"use server";

import { createAdminClient } from "@/utils/supabase/admin";

const CAMPAIGN_ID = "00000000-0000-0000-0000-000000000010"; // demo: Reyes campaign

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
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("list_turfs", { p_campaign: CAMPAIGN_ID });
  if (error) {
    console.error("listTurfs:", error.message);
    return [];
  }
  return (data ?? []) as SavedTurf[];
}

export async function saveTurf(geometry: GeoPolygon): Promise<{ ok: boolean }> {
  const supabase = createAdminClient();
  const { error } = await supabase.rpc("create_turf", {
    p_campaign: CAMPAIGN_ID,
    p_geojson: geometry,
  });
  if (error) {
    console.error("saveTurf:", error.message);
    return { ok: false };
  }
  return { ok: true };
}
