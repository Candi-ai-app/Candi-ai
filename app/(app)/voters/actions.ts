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
