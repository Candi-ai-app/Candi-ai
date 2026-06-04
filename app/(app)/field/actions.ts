"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { getActiveCampaign } from "@/lib/campaign";
import type { RouteStop } from "@/app/(app)/canvassing/actions";

/** The voter attached to a route stop (one household = one primary voter). */
export type StopVoter = {
  voterId: string;
  name: string;
  party: "D" | "R" | "I" | null;
  support: number | null;
  phone: string | null;
};

/** A route stop enriched with its voter contact card. */
export type FieldStop = RouteStop & {
  voter: StopVoter | null;
  /** Count of additional registered voters at the same address. */
  othersAtAddress: number;
};

export type FieldTurf = {
  id: string;
  name: string;
  status: string;
  doorCount: number;
  /** Raw ordered route (used to draw the map line). */
  route: RouteStop[];
  /** Same order as `route`, enriched with the voter at each door. */
  stops: FieldStop[];
};

type VoterRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  party: string | null;
  support: number | null;
  phone: string | null;
  address: string | null;
};

const normAddr = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();

/**
 * Returns all turfs assigned to the current user (via their membership in the
 * active campaign's org) that have a generated walking route — each stop enriched
 * with the voter contact card at that address.
 */
export async function getFieldTurfs(): Promise<FieldTurf[]> {
  const campaign = await getActiveCampaign();
  if (!campaign) return [];

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

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

  const baseTurfs = ((data ?? []) as Array<{
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

  if (baseTurfs.length === 0) return [];

  // Look up the voters at every stop address in one query, then attach.
  const allAddresses = Array.from(
    new Set(baseTurfs.flatMap((t) => t.route.map((s) => s.address)).filter(Boolean))
  );

  const votersByAddr = new Map<string, VoterRow[]>();
  if (allAddresses.length > 0) {
    const { data: voterData } = await supabase
      .from("voters")
      .select("id, first_name, last_name, party, support, phone, address")
      .eq("campaign_id", campaign.id)
      .in("address", allAddresses);
    for (const v of (voterData ?? []) as VoterRow[]) {
      const key = normAddr(v.address);
      if (!votersByAddr.has(key)) votersByAddr.set(key, []);
      votersByAddr.get(key)!.push(v);
    }
  }

  return baseTurfs.map((t) => ({
    ...t,
    stops: t.route.map((s) => {
      const group = votersByAddr.get(normAddr(s.address)) ?? [];
      const primary = group[0] ?? null;
      const voter: StopVoter | null = primary
        ? {
            voterId: primary.id,
            name: `${primary.first_name ?? ""} ${primary.last_name ?? ""}`.trim() || "Registered voter",
            party: (primary.party as "D" | "R" | "I" | null) ?? null,
            support: primary.support,
            phone: primary.phone,
          }
        : null;
      return { ...s, voter, othersAtAddress: Math.max(0, group.length - 1) };
    }),
  }));
}

/**
 * Log a door-knock contact for the current canvasser. When a voterId is provided
 * the contact is linked to that voter (so it shows on their contact card), and a
 * supporter score updates the voter's support level.
 */
export async function logDoorContact(params: {
  turfId: string;
  stopAddress: string;
  voterId: string | null;
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
    voter_id: params.voterId,
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

  // A supporter score at the door updates the voter's support level so HQ + the
  // voter card reflect it immediately.
  if (params.voterId && params.support != null) {
    const { error: upErr } = await supabase
      .from("voters")
      .update({ support: params.support })
      .eq("id", params.voterId)
      .eq("campaign_id", campaign.id);
    if (upErr) console.error("logDoorContact support update:", upErr.message);
  }

  revalidatePath("/field");
  return { ok: true };
}

/**
 * Upsert the current canvasser's live GPS location (called every ~15s by the
 * field app while walking). Resolves the signed-in user's membership in the
 * active campaign and writes one row keyed by membership.
 */
export async function pingLocation(params: {
  lng: number;
  lat: number;
  accuracy?: number | null;
}): Promise<{ ok: boolean; error?: string }> {
  const campaign = await getActiveCampaign();
  if (!campaign) return { ok: false, error: "No active campaign" };
  if (!Number.isFinite(params.lng) || !Number.isFinite(params.lat)) {
    return { ok: false, error: "Invalid coordinates" };
  }

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

  const { error } = await supabase.from("canvasser_locations").upsert(
    {
      membership_id: (membership as { id: string }).id,
      campaign_id: campaign.id,
      lng: params.lng,
      lat: params.lat,
      accuracy: params.accuracy ?? null,
      status: "active",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "membership_id" }
  );
  if (error) {
    console.error("pingLocation:", error.message);
    return { ok: false, error: error.message };
  }
  return { ok: true };
}
