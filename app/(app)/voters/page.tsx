import { VotersView } from "@/components/voters/voters-view";
import { createAdminClient } from "@/utils/supabase/admin";
import type { Voter, Party } from "@/lib/mock-data";

const CAMPAIGN_ID = "00000000-0000-0000-0000-000000000010"; // demo: Reyes for State Senate

export const dynamic = "force-dynamic";

export default async function VotersPage() {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("voters")
    .select(
      "external_id, first_name, last_name, age, party, precinct, address, city, zip, phone, support, persuasion, vote_history, flags"
    )
    .eq("campaign_id", CAMPAIGN_ID)
    .order("last_name", { ascending: true });

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
  }));

  return <VotersView initialVoters={voters} />;
}
