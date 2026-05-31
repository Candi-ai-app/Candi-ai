import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { CampaignOnboarding } from "@/components/select/campaign-onboarding";
import { AREAS, SAMPLE_VOTER_COUNT } from "@/lib/areas";

export const dynamic = "force-dynamic";

export default async function NewCampaignPage() {
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

  return <CampaignOnboarding areas={AREAS} sampleCount={SAMPLE_VOTER_COUNT} />;
}
