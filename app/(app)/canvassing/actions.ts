"use server";

import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { getActiveCampaign, getActiveCampaignId } from "@/lib/campaign";

export type GeoPolygon = { type: "Polygon"; coordinates: number[][][] };

export type SavedTurf = {
  id: string;
  name: string;
  status: string;
  voter_count: number;
  door_count: number;
  boundary: GeoPolygon;
};

/** A real turf enriched for the canvassing list + detail drawer. */
export type TurfListItem = {
  id: string;
  name: string;
  status: string; // queued | active | complete
  voterCount: number;
  doorCount: number;
  /** Resolved assignee display name, or null when unassigned / unresolvable. */
  assignee: string | null;
  /** Whether the turf has a stored boundary (drawn on the map). */
  hasBoundary: boolean;
};

/** Header stats for the canvassing module, all from real campaign data. */
export type TurfStats = {
  activeTurfs: number;
  totalTurfs: number;
  canvassers: number;
  doorsToday: number;
};

export type CanvassingData = { turfs: TurfListItem[]; stats: TurfStats };

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

/** "diego.reyes@candi.app" → "Diego Reyes"; empty → null. */
function emailToName(email: string): string | null {
  const local = (email.split("@")[0] ?? "").trim();
  if (!local) return null;
  return local
    .split(/[._-]+/)
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
}

/** Local YYYY-MM-DD key (matches how HQ buckets contacts). */
function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

/**
 * Real turf list + header stats for the canvassing module, RLS-scoped to the
 * active campaign. Turf rows come straight from the `turfs` table; assignee names
 * are resolved via the trusted admin client purely for display (auth emails are
 * not readable by the authenticated client). Header stats reuse the HQ contacts
 * logic for "doors today". Returns empty/zeroed data for empty campaigns.
 */
export async function getCanvassingData(): Promise<CanvassingData> {
  const empty: CanvassingData = {
    turfs: [],
    stats: { activeTurfs: 0, totalTurfs: 0, canvassers: 0, doorsToday: 0 },
  };

  const campaign = await getActiveCampaign();
  if (!campaign) return empty;

  const supabase = await createClient();
  const todayKey = dayKey(new Date());
  const sinceToday = new Date();
  sinceToday.setHours(0, 0, 0, 0);

  const [turfsRes, canvasserRes, doorsTodayRes] = await Promise.all([
    supabase
      .from("turfs")
      .select("id, name, status, voter_count, door_count, assignee_id, boundary")
      .eq("campaign_id", campaign.id)
      .order("created_at", { ascending: true }),
    // Canvassers in this campaign's org (matches the HQ "Canvassers in field" set).
    supabase
      .from("memberships")
      .select("id", { count: "exact", head: true })
      .eq("org_id", campaign.org_id)
      .eq("role", "canvasser"),
    // Door contacts logged today → "doors knocked today" (real, like HQ).
    supabase
      .from("contacts")
      .select("created_at")
      .eq("campaign_id", campaign.id)
      .eq("channel", "door")
      .gte("created_at", sinceToday.toISOString())
      .limit(5000),
  ]);

  type TurfRow = {
    id: string;
    name: string;
    status: string;
    voter_count: number | null;
    door_count: number | null;
    assignee_id: string | null;
    boundary: unknown;
  };
  const turfRows = (turfsRes.data ?? []) as TurfRow[];

  // Resolve assignee membership ids → display names via auth emails (admin client,
  // display-only). Row scoping still comes from RLS on the turf read above.
  const assigneeIds = [...new Set(turfRows.map((t) => t.assignee_id).filter(Boolean) as string[])];
  const nameById = new Map<string, string | null>();
  if (assigneeIds.length > 0) {
    try {
      const admin = createAdminClient();
      const { data: mems } = await admin
        .from("memberships")
        .select("id, user_id")
        .in("id", assigneeIds);
      await Promise.all(
        (mems ?? []).map(async (m) => {
          const { data } = await admin.auth.admin.getUserById(m.user_id as string);
          nameById.set(m.id as string, emailToName(data?.user?.email ?? ""));
        })
      );
    } catch {
      /* email lookup unavailable — assignees fall back to null (Unassigned) */
    }
  }

  const turfs: TurfListItem[] = turfRows.map((t) => ({
    id: t.id,
    name: t.name,
    status: t.status,
    voterCount: t.voter_count ?? 0,
    doorCount: t.door_count ?? 0,
    assignee: t.assignee_id ? nameById.get(t.assignee_id) ?? null : null,
    hasBoundary: t.boundary != null,
  }));

  const doorsToday = ((doorsTodayRes.data ?? []) as { created_at: string }[]).reduce(
    (n, r) => n + (dayKey(new Date(r.created_at)) === todayKey ? 1 : 0),
    0
  );

  return {
    turfs,
    stats: {
      activeTurfs: turfs.filter((t) => t.status === "active").length,
      totalTurfs: turfs.length,
      canvassers: canvasserRes.count ?? 0,
      doorsToday,
    },
  };
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
