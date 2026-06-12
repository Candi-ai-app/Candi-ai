"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { getActiveCampaign, getActiveCampaignId } from "@/lib/campaign";

export type GeoPolygon = { type: "Polygon"; coordinates: number[][][] };

/** One stop on a generated walking route (a door / household). */
export type RouteStop = { lng: number; lat: number; address: string };

export type SavedTurf = {
  id: string;
  name: string;
  status: string;
  voter_count: number;
  door_count: number;
  boundary: GeoPolygon;
  /** Optimized walking order of stops, or null if no route generated yet. */
  route: RouteStop[] | null;
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
  /** Assignee membership id (stable key for grouping by canvasser). */
  assigneeId: string | null;
  /** Whether the turf has a stored boundary (drawn on the map). */
  hasBoundary: boolean;
  /** Number of stops in the generated walking route (0 = no route yet). */
  routeStops: number;
  /** The ordered walking-route stops (empty when no route generated). */
  route: RouteStop[];
};

/** Header stats for the canvassing module, all from real campaign data. */
export type TurfStats = {
  activeTurfs: number;
  totalTurfs: number;
  canvassers: number;
  doorsToday: number;
};

/** A resolvable workspace member (for turf assignment dropdowns). */
export type CampaignMember = {
  id: string;        // memberships.id — this is what assignee_id stores
  name: string;      // resolved from auth email
  role: string;
};

export type CanvassingData = {
  turfs: TurfListItem[];
  stats: TurfStats;
  members: CampaignMember[];
  /** The campaign's county (raw DB value, e.g. "Broward" or "Broward County"). */
  campaignCounty: string | null;
};

/** One plottable voter for the turf map (from the voter_points RPC). */
export type VoterPoint = {
  external_id: string;
  first_name: string | null;
  last_name: string | null;
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
    members: [],
    campaignCounty: null,
  };

  const campaign = await getActiveCampaign();
  if (!campaign) return empty;

  const supabase = await createClient();
  const todayKey = dayKey(new Date());
  const sinceToday = new Date();
  sinceToday.setHours(0, 0, 0, 0);

  const [turfsRes, membersRes, doorsTodayRes] = await Promise.all([
    supabase
      .from("turfs")
      .select("id, name, status, voter_count, door_count, assignee_id, boundary, route")
      .eq("campaign_id", campaign.id)
      .order("created_at", { ascending: true }),
    // All campaign org members (canvassers + directors) for stats + assignment.
    supabase
      .from("memberships")
      .select("id, user_id, role")
      .eq("org_id", campaign.org_id),
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
    route: unknown;
  };
  const turfRows = (turfsRes.data ?? []) as TurfRow[];
  type MemberRow = { id: string; user_id: string; role: string };
  const memberRows = (membersRes.data ?? []) as MemberRow[];

  // Resolve all member user_ids → display names via auth emails (admin client,
  // display-only). Used for both the assignee names on turf cards AND the
  // assignment dropdown in the drawer.
  const nameById = new Map<string, string | null>();
  if (memberRows.length > 0) {
    try {
      const admin = createAdminClient();
      await Promise.all(
        memberRows.map(async (m) => {
          const { data } = await admin.auth.admin.getUserById(m.user_id);
          nameById.set(m.id, emailToName(data?.user?.email ?? ""));
        })
      );
    } catch {
      /* email lookup unavailable — names fall back to null */
    }
  }

  const members: CampaignMember[] = memberRows.map((m) => ({
    id: m.id,
    name: nameById.get(m.id) ?? "Member",
    role: m.role,
  }));

  const turfs: TurfListItem[] = turfRows.map((t) => ({
    id: t.id,
    name: t.name,
    status: t.status,
    voterCount: t.voter_count ?? 0,
    doorCount: t.door_count ?? 0,
    assignee: t.assignee_id ? nameById.get(t.assignee_id) ?? null : null,
    assigneeId: t.assignee_id,
    hasBoundary: t.boundary != null,
    routeStops: Array.isArray(t.route) ? t.route.length : 0,
    route: Array.isArray(t.route) ? (t.route as RouteStop[]) : [],
  }));

  const doorsToday = ((doorsTodayRes.data ?? []) as { created_at: string }[]).reduce(
    (n, r) => n + (dayKey(new Date(r.created_at)) === todayKey ? 1 : 0),
    0
  );

  return {
    turfs,
    members,
    campaignCounty: campaign.county ?? null,
    stats: {
      activeTurfs: turfs.filter((t) => t.status === "active").length,
      totalTurfs: turfs.length,
      canvassers: memberRows.filter((m) => m.role === "canvasser").length,
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
): Promise<{ ok: boolean; error?: string }> {
  const campaignId = await getActiveCampaignId();
  if (!campaignId) return { ok: false, error: "No active campaign" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("create_turf", {
    p_campaign: campaignId,
    p_geojson: geometry,
    p_voter_count: counts?.voterCount ?? null,
    p_door_count: counts?.doorCount ?? null,
  });
  if (error) {
    console.error("saveTurf:", error.message);
    return { ok: false, error: error.message };
  }
  revalidatePath("/canvassing");
  return { ok: true };
}

/** Update the assignee on a turf (null = unassign). RLS: must own the campaign. */
export async function assignTurf(
  turfId: string,
  memberId: string | null
): Promise<{ ok: boolean; error?: string }> {
  const campaignId = await getActiveCampaignId();
  if (!campaignId) return { ok: false, error: "No active campaign" };
  const supabase = await createClient();
  const { error } = await supabase
    .from("turfs")
    .update({ assignee_id: memberId })
    .eq("id", turfId)
    .eq("campaign_id", campaignId);
  if (error) {
    console.error("assignTurf:", error.message);
    return { ok: false, error: error.message };
  }
  revalidatePath("/canvassing");
  return { ok: true };
}

/** Set the status of a turf (queued | active | complete). */
export async function setTurfStatus(
  turfId: string,
  status: "queued" | "active" | "complete"
): Promise<{ ok: boolean; error?: string }> {
  const campaignId = await getActiveCampaignId();
  if (!campaignId) return { ok: false, error: "No active campaign" };
  const supabase = await createClient();
  const { error } = await supabase
    .from("turfs")
    .update({ status })
    .eq("id", turfId)
    .eq("campaign_id", campaignId);
  if (error) {
    console.error("setTurfStatus:", error.message);
    return { ok: false, error: error.message };
  }
  revalidatePath("/canvassing");
  return { ok: true };
}

/** Store a generated walking route (ordered stops) on a turf. Pass [] to clear. */
export async function setTurfRoute(
  turfId: string,
  route: RouteStop[]
): Promise<{ ok: boolean; error?: string }> {
  const campaignId = await getActiveCampaignId();
  if (!campaignId) return { ok: false, error: "No active campaign" };
  const supabase = await createClient();
  const { error } = await supabase
    .from("turfs")
    .update({ route: route.length ? route : null })
    .eq("id", turfId)
    .eq("campaign_id", campaignId);
  if (error) {
    console.error("setTurfRoute:", error.message);
    return { ok: false, error: error.message };
  }
  revalidatePath("/canvassing");
  return { ok: true };
}

/**
 * Split a turf into N vertical strips (via the split_turf RPC). The original is
 * replaced by N children named "<orig> · k", each with server-computed counts.
 */
export async function splitTurf(
  turfId: string,
  n: number
): Promise<{ ok: boolean; created?: number; error?: string }> {
  const campaignId = await getActiveCampaignId();
  if (!campaignId) return { ok: false, error: "No active campaign" };
  if (n < 2 || n > 12) return { ok: false, error: "Choose between 2 and 12 pieces" };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("split_turf", {
    p_campaign: campaignId,
    p_turf: turfId,
    p_n: n,
  });
  if (error) {
    console.error("splitTurf:", error.message);
    return { ok: false, error: error.message };
  }
  revalidatePath("/canvassing");
  return { ok: true, created: typeof data === "number" ? data : undefined };
}

/** Rename a turf. Name is trimmed; empty string is rejected. */
export async function renameTurf(
  turfId: string,
  name: string
): Promise<{ ok: boolean; error?: string }> {
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, error: "Name cannot be empty" };
  const campaignId = await getActiveCampaignId();
  if (!campaignId) return { ok: false, error: "No active campaign" };
  const supabase = await createClient();
  const { error } = await supabase
    .from("turfs")
    .update({ name: trimmed })
    .eq("id", turfId)
    .eq("campaign_id", campaignId);
  if (error) {
    console.error("renameTurf:", error.message);
    return { ok: false, error: error.message };
  }
  revalidatePath("/canvassing");
  return { ok: true };
}

/** Permanently delete a turf. Scoped to the active campaign. The saved-turfs
 *  layer on the map refreshes via router.refresh() after the action resolves. */
export async function deleteTurf(
  turfId: string
): Promise<{ ok: boolean; error?: string }> {
  const campaignId = await getActiveCampaignId();
  if (!campaignId) return { ok: false, error: "No active campaign" };
  const supabase = await createClient();
  const { error } = await supabase
    .from("turfs")
    .delete()
    .eq("id", turfId)
    .eq("campaign_id", campaignId);
  if (error) {
    console.error("deleteTurf:", error.message);
    return { ok: false, error: error.message };
  }
  revalidatePath("/canvassing");
  return { ok: true };
}

/** Bulk-delete turfs (multi-select). Campaign-scoped; one round trip. */
export async function deleteTurfs(
  ids: string[]
): Promise<{ ok: boolean; deleted: number; error?: string }> {
  const campaignId = await getActiveCampaignId();
  if (!campaignId) return { ok: false, deleted: 0, error: "No active campaign" };
  if (ids.length === 0) return { ok: true, deleted: 0 };
  const supabase = await createClient();
  const { error, count } = await supabase
    .from("turfs")
    .delete({ count: "exact" })
    .in("id", ids)
    .eq("campaign_id", campaignId);
  if (error) {
    console.error("deleteTurfs:", error.message);
    return { ok: false, deleted: 0, error: error.message };
  }
  revalidatePath("/canvassing");
  return { ok: true, deleted: count ?? ids.length };
}

/** Per-precinct voter + supporter counts for the precinct map overlay. */
export type PrecinctStat = {
  /** 2026 Broward precinct code (matches the GeoJSON PRECINCT property). */
  precinct: string;
  voters: number;
  /** Voters scored 4–5 — the same "Supporters ID'd" definition HQ uses. */
  supporters: number;
};

/**
 * Voter + supporter counts grouped by precinct for the active campaign, via the
 * precinct_stats RPC (aggregating in SQL sidesteps supabase-js's 1000-row select
 * cap). SECURITY DEFINER but RLS-equivalent, like voter_points: rows only come
 * back when the caller belongs to the campaign (user_campaign_ids check). The
 * RPC also normalizes SoE precinct codes onto the 2026 boundary codes (split
 * suffixes like "K002.1" → K002; retired pre-2026 codes via the county's
 * renumber crosswalk, e.g. K008 → K001), so the client can join the result
 * straight onto the GeoJSON PRECINCT property.
 */
export async function getPrecinctStats(): Promise<PrecinctStat[]> {
  const campaignId = await getActiveCampaignId();
  if (!campaignId) return [];
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("precinct_stats", { p_campaign: campaignId });
  if (error) {
    console.error("getPrecinctStats:", error.message);
    return [];
  }
  return (data ?? []) as PrecinctStat[];
}

/** A canvasser's live position + today's progress, for the owner's Canvassers map. */
export type CanvasserLocation = {
  membershipId: string;
  lng: number;
  lat: number;
  updatedAt: string;
  doorsToday: number;
  status: "active" | "idle" | "offline";
};

/**
 * Live locations for every canvasser who has pinged from the field app, plus the
 * doors each has knocked today. Polled by the Canvassers tab for near-real-time
 * tracking. RLS-scoped to the active campaign.
 */
export async function getCanvasserLocations(): Promise<CanvasserLocation[]> {
  const campaign = await getActiveCampaign();
  if (!campaign) return [];
  const supabase = await createClient();

  const sinceToday = new Date();
  sinceToday.setHours(0, 0, 0, 0);
  const todayKey = dayKey(new Date());

  const [locRes, contactsRes] = await Promise.all([
    supabase
      .from("canvasser_locations")
      .select("membership_id, lng, lat, updated_at")
      .eq("campaign_id", campaign.id),
    supabase
      .from("contacts")
      .select("canvasser_id, created_at")
      .eq("campaign_id", campaign.id)
      .eq("channel", "door")
      .gte("created_at", sinceToday.toISOString())
      .limit(20000),
  ]);

  const doorsByCanv = new Map<string, number>();
  for (const c of (contactsRes.data ?? []) as { canvasser_id: string | null; created_at: string }[]) {
    if (c.canvasser_id && dayKey(new Date(c.created_at)) === todayKey) {
      doorsByCanv.set(c.canvasser_id, (doorsByCanv.get(c.canvasser_id) ?? 0) + 1);
    }
  }

  const now = Date.now();
  return ((locRes.data ?? []) as { membership_id: string; lng: number; lat: number; updated_at: string }[]).map((l) => {
    const ageMin = (now - new Date(l.updated_at).getTime()) / 60000;
    const status: CanvasserLocation["status"] = ageMin < 3 ? "active" : ageMin < 15 ? "idle" : "offline";
    return {
      membershipId: l.membership_id,
      lng: l.lng,
      lat: l.lat,
      updatedAt: l.updated_at,
      doorsToday: doorsByCanv.get(l.membership_id) ?? 0,
      status,
    };
  });
}
