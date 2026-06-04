"use server";

import { createClient } from "@/utils/supabase/server";
import { getActiveCampaignId } from "@/lib/campaign";

/**
 * Update a single voter's editable campaign fields — support score and tags
 * (`flags`) — scoped to the active campaign. RLS (`voters_all`) already restricts
 * writes to campaigns the signed-in user belongs to; we additionally pin the
 * update to the active campaign + the voter's `external_id` (the unique key the
 * UI carries as `Voter.id`).
 *
 * Only `support` and `flags` are writable here — the voter file is the source of
 * truth for demographics. `support` is clamped to the schema's 0–5 check; `flags`
 * is de-duplicated. Returns the persisted values so the client can reconcile.
 */
export async function updateVoter(
  externalId: string,
  patch: { support?: number; flags?: string[] }
): Promise<{ ok: boolean; support?: number; flags?: string[] }> {
  const campaignId = await getActiveCampaignId();
  if (!campaignId || !externalId) return { ok: false };

  const fields: { support?: number; flags?: string[] } = {};
  if (typeof patch.support === "number" && Number.isFinite(patch.support)) {
    fields.support = Math.max(0, Math.min(5, Math.round(patch.support)));
  }
  if (Array.isArray(patch.flags)) {
    fields.flags = [...new Set(patch.flags.map((f) => String(f)).filter(Boolean))];
  }
  if (Object.keys(fields).length === 0) return { ok: false };

  const supabase = await createClient();
  // The Supabase client is untyped (no generated Database types), so .update()
  // infers its payload as `never`; cast the well-formed payload through unknown
  // (matches the pattern in app/select/actions.ts).
  const { data, error } = await supabase
    .from("voters")
    .update(fields as unknown as never)
    .eq("campaign_id", campaignId)
    .eq("external_id", externalId)
    .select("support, flags")
    .maybeSingle();

  if (error || !data) {
    if (error) console.error("updateVoter:", error.message);
    return { ok: false };
  }
  return {
    ok: true,
    support: (data.support as number) ?? undefined,
    flags: (data.flags as string[]) ?? undefined,
  };
}

/**
 * Bulk-tag voters by appending `tag` to each `voters.flags` array, scoped to the
 * active campaign and the given `external_id` set. Used by the toolbar bulk
 * actions (Add to text queue → `text-queue`; Add to call list → `call-list`).
 *
 * Efficiency: this targets the rows by `external_id IN (…)` and pushes the tag
 * with a single Postgres `array_append` per row via an RPC — no per-voter
 * round-trips. The RPC is idempotent (only appends when the tag is absent) and is
 * SECURITY DEFINER but re-checks campaign membership, so it stays RLS-safe.
 *
 * Returns the number of voters newly tagged (rows that didn't already carry it).
 */
export async function tagVoters(
  externalIds: string[],
  tag: string
): Promise<{ ok: boolean; count: number }> {
  const campaignId = await getActiveCampaignId();
  const ids = [...new Set((externalIds ?? []).map((s) => String(s)).filter(Boolean))];
  const cleanTag = String(tag ?? "").trim();
  if (!campaignId || !cleanTag || ids.length === 0) return { ok: false, count: 0 };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("tag_voters", {
    p_campaign: campaignId,
    p_external_ids: ids,
    p_tag: cleanTag,
  });
  if (error) {
    console.error("tagVoters:", error.message);
    return { ok: false, count: 0 };
  }
  return { ok: true, count: (data as number) ?? 0 };
}

/** A household co-resident — the subset of voter fields the detail card shows. */
export type HouseholdMember = {
  id: string; // external_id (the key the UI carries as Voter.id)
  name: string;
  party: "D" | "R" | "I";
  age: number;
  support: number;
};

/**
 * Other voters at the selected voter's exact `address` — the "others at this
 * address" household list in the Voters detail card.
 *
 * RLS-scoped (session client) + pinned to the active campaign and the voter's
 * `external_id`. We first read the selected voter's address, then return the OTHER
 * voters at that same address (same campaign, excluding self), ordered by last
 * name and capped at 40 (an apartment building with no unit numbers can collapse
 * many voters onto one address — the cap keeps the payload bounded; the UI labels
 * the large-group case so it isn't mistaken for one family).
 *
 * Returns `{ address, members }`. A blank/missing address yields no members.
 */
export async function getHousehold(
  externalId: string
): Promise<{ address: string | null; members: HouseholdMember[] }> {
  const campaignId = await getActiveCampaignId();
  if (!campaignId || !externalId) return { address: null, members: [] };

  const supabase = await createClient();

  // 1) The selected voter's address (RLS limits this to the user's campaigns).
  const { data: self, error: selfErr } = await supabase
    .from("voters")
    .select("address")
    .eq("campaign_id", campaignId)
    .eq("external_id", externalId)
    .maybeSingle();
  if (selfErr || !self) {
    if (selfErr) console.error("getHousehold(self):", selfErr.message);
    return { address: null, members: [] };
  }
  const address = (self.address as string | null) ?? null;
  if (!address || !address.trim()) return { address, members: [] };

  // 2) The OTHER voters at that exact address (same campaign, excluding self).
  //    Index-served by voters_campaign_address_idx (campaign_id, address).
  const { data, error } = await supabase
    .from("voters")
    .select("external_id, first_name, last_name, party, age, support")
    .eq("campaign_id", campaignId)
    .eq("address", address)
    .neq("external_id", externalId)
    .order("last_name", { ascending: true })
    .limit(40);
  if (error) {
    console.error("getHousehold(members):", error.message);
    return { address, members: [] };
  }

  const members: HouseholdMember[] = (data ?? []).map((r) => ({
    id: (r.external_id as string) ?? "",
    name: `${r.first_name ?? ""} ${r.last_name ?? ""}`.trim(),
    party: ((r.party as string) ?? "I") as "D" | "R" | "I",
    age: (r.age as number) ?? 0,
    support: (r.support as number) ?? 0,
  }));
  return { address, members };
}

/** One contact entry for a voter's activity timeline. */
export type VoterContact = {
  id: string;
  channel: string;
  result: string | null;
  support: number | null;
  /** Human note with the internal turf:/address: tags stripped off. */
  note: string;
  createdAt: string;
};

/**
 * Recent contacts for one voter (newest first), for the detail card's Activity
 * timeline. `externalId` is the row id the UI carries (voters.external_id). Notes
 * logged at the door (incl. from the GPS field app) surface here. Scoped to the
 * active campaign via RLS + an explicit campaign filter.
 */
export async function getVoterContacts(externalId: string): Promise<VoterContact[]> {
  const campaignId = await getActiveCampaignId();
  if (!campaignId || !externalId) return [];
  const supabase = await createClient();

  const { data: voter } = await supabase
    .from("voters")
    .select("id")
    .eq("campaign_id", campaignId)
    .eq("external_id", externalId)
    .maybeSingle();
  if (!voter) return [];

  const { data, error } = await supabase
    .from("contacts")
    .select("id, channel, result, support, notes, created_at")
    .eq("campaign_id", campaignId)
    .eq("voter_id", (voter as { id: string }).id)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) {
    console.error("getVoterContacts:", error.message);
    return [];
  }

  return ((data ?? []) as Array<{
    id: string; channel: string; result: string | null; support: number | null; notes: string | null; created_at: string;
  }>).map((c) => ({
    id: c.id,
    channel: c.channel,
    result: c.result,
    support: c.support,
    // Strip the internal " | turf:… | address:…" context the field app appends.
    note: (c.notes ?? "").split(" | turf:")[0].trim(),
    createdAt: c.created_at,
  }));
}
