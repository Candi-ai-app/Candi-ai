import { VotersView } from "@/components/voters/voters-view";
import { createClient } from "@/utils/supabase/server";
import { getActiveCampaignId } from "@/lib/campaign";
import type { Voter, Party } from "@/lib/mock-data";

export const dynamic = "force-dynamic";

export default async function VotersPage() {
  // RLS-scoped: returns rows only for campaigns the signed-in user is a member of.
  const supabase = await createClient();
  const campaignId = await getActiveCampaignId();
  const { data } = campaignId
    ? await supabase
        .from("voters")
        .select(
          "external_id, first_name, last_name, age, party, precinct, address, city, zip, phone, support, persuasion, vote_history, flags, race, gender"
        )
        .eq("campaign_id", campaignId)
        .order("last_name", { ascending: true })
    : { data: [] };

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
    support: (r.support as number) ?? 0,
    persuasion: (r.persuasion as number) ?? 0,
    history: (r.vote_history as { label?: string } | null)?.label ?? "",
    last: "—",
    flags: (r.flags as string[]) ?? [],
    race: (r.race as string) ?? undefined,
    gender: (r.gender as string) ?? undefined,
    elections: (r.vote_history as { history?: Record<string, boolean> } | null)?.history ?? {},
  }));

  return <VotersView initialVoters={voters} />;
}
