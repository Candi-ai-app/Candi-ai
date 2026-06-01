import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { highestRole } from "@/lib/auth";
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
    .select("id, candidate, office, district, election_date, photo_url")
    .order("candidate", { ascending: true });

  const { data: memberships } = await supabase
    .from("memberships")
    .select("role")
    .eq("user_id", user.id);
  const role = highestRole(memberships);

  return (
    <CampaignPicker
      campaigns={(campaigns ?? []) as PickerCampaign[]}
      canManage={role === "owner" || role === "director"}
      email={user.email ?? ""}
    />
  );
}
