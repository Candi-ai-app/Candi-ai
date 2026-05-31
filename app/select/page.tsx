import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { CampaignPicker, type PickerCampaign } from "@/components/select/campaign-picker";

export const dynamic = "force-dynamic";

export default async function SelectCampaignPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // RLS returns only campaigns in orgs the user is a member of.
  const { data: campaigns } = await supabase
    .from("campaigns")
    .select("id, candidate, office, district, election_date")
    .order("candidate", { ascending: true });

  const { data: membership } = await supabase
    .from("memberships")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();
  const role = (membership?.role as string) ?? "canvasser";

  return (
    <CampaignPicker
      campaigns={(campaigns ?? []) as PickerCampaign[]}
      canCreate={role === "owner" || role === "director"}
      email={user.email ?? ""}
    />
  );
}
