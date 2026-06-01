import { VotersView } from "@/components/voters/voters-view";
import { createClient } from "@/utils/supabase/server";
import { getActiveCampaign } from "@/lib/campaign";
import type { Voter, Party } from "@/lib/mock-data";

export const dynamic = "force-dynamic";

export default async function VotersPage() {
  // RLS-scoped: returns rows only for campaigns the signed-in user is a member of.
  const supabase = await createClient();
  const campaign = await getActiveCampaign();
  const campaignId = campaign?.id ?? null;
  const { data } = campaignId
    ? await supabase
        .from("voters")
        .select(
          "external_id, first_name, last_name, age, party, precinct, address, city, zip, phone, email, support, persuasion, vote_history, flags, race, gender, vanid, mailing_address"
        )
        .eq("campaign_id", campaignId)
        .order("last_name", { ascending: true })
    : { data: [] };

  // Real contacted count for the active campaign: distinct voters that have at
  // least one contact row. Falls back to 0 for empty/unselected campaigns.
  let contactedCount = 0;
  if (campaignId) {
    const { data: contactRows } = await supabase
      .from("contacts")
      .select("voter_id")
      .eq("campaign_id", campaignId)
      .not("voter_id", "is", null)
      .limit(50000);
    contactedCount = new Set((contactRows ?? []).map((r) => r.voter_id as string)).size;
  }

  // Decide whether a VAN mailing address is the SAME place as the residence, so we
  // only surface a Mailing row when it's genuinely different. The stored
  // mailing_address is a full one-line string ("123 NW 4 St, City, FL 33311") while
  // `address` is street-only, so compare just the mailing STREET (before the first
  // comma). Tokenize both (uppercase, drop punctuation), and treat them as the same
  // place when one token list is a prefix of the other — that absorbs unit-suffix
  // differences (e.g. residence "123 NW 4 ST APT 2" vs mailing "123 NW 4 St").
  const sameAddr = (mailing?: string | null, residence?: string | null) => {
    const toks = (s?: string | null) =>
      (s ?? "")
        .toUpperCase()
        .replace(/[^A-Z0-9\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .split(" ")
        .filter(Boolean);
    const mailStreet = (mailing ?? "").split(",")[0];
    const a = toks(mailStreet);
    const b = toks(residence);
    if (a.length === 0 || b.length === 0) return false;
    const n = Math.min(a.length, b.length);
    for (let i = 0; i < n; i++) if (a[i] !== b[i]) return false;
    return true; // one is a prefix of the other ⇒ same place
  };

  const voters: Voter[] = (data ?? []).map((r) => ({
    id: (r.external_id as string) ?? "",
    name: `${r.first_name ?? ""} ${r.last_name ?? ""}`.trim(),
    age: (r.age as number) ?? 0,
    party: ((r.party as string) ?? "I") as Party,
    precinct: (r.precinct as string) ?? "",
    addr: (r.address as string) ?? "",
    city: (r.city as string) ?? "",
    zip: (r.zip as string) ?? "",
    phone: (r.phone as string) ?? "",
    email: (r.email as string) ?? undefined,
    support: (r.support as number) ?? 0,
    persuasion: (r.persuasion as number) ?? 0,
    history: (r.vote_history as { label?: string } | null)?.label ?? "",
    last: "—",
    flags: (r.flags as string[]) ?? [],
    race: (r.race as string) ?? undefined,
    gender: (r.gender as string) ?? undefined,
    elections: (r.vote_history as { history?: Record<string, boolean> } | null)?.history ?? {},
    vanid: (r.vanid as string) || undefined,
    // Surface the mailing address only when present AND different from residence.
    mailingAddress:
      r.mailing_address && !sameAddr(r.mailing_address as string, r.address as string)
        ? (r.mailing_address as string)
        : undefined,
  }));

  return (
    <VotersView
      initialVoters={voters}
      district={campaign?.district ?? null}
      contactedCount={contactedCount}
    />
  );
}
