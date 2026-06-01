import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { CampaignOnboarding, type ResumeDraft } from "@/components/select/campaign-onboarding";
import { AREAS, SAMPLE_VOTER_COUNT } from "@/lib/areas";

export const dynamic = "force-dynamic";

export default async function NewCampaignPage({
  searchParams,
}: {
  searchParams: Promise<{ resume?: string }>;
}) {
  const { resume } = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Owners/directors only — canvassers can't create campaigns.
  const { data: membership } = await supabase
    .from("memberships")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();
  const role = (membership?.role as string) ?? "canvasser";
  if (role !== "owner" && role !== "director") redirect("/select");

  // Resume flow: load the draft campaign to prefill the wizard. RLS scopes this
  // to the user's orgs; if it's missing, fall back to a fresh wizard.
  let draft: ResumeDraft | null = null;
  if (resume) {
    const { data } = await supabase
      .from("campaigns")
      .select("id, candidate, office, district, state, county, election_date, photo_url")
      .eq("id", resume)
      .maybeSingle();
    if (data) draft = data as ResumeDraft;
  }

  return <CampaignOnboarding areas={AREAS} sampleCount={SAMPLE_VOTER_COUNT} draft={draft} />;
}
