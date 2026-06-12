import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { highestRole } from "@/lib/auth";
import { CampaignPicker, type PickerCampaign } from "@/components/select/campaign-picker";
import { FirstLoginBootstrap } from "@/components/select/first-login-bootstrap";

export const dynamic = "force-dynamic";

// Shared demo org ids — a user whose ONLY membership is in one of these orgs
// should not trigger the first-login bootstrap (they're using a shared demo).
const SHARED_DEMO_ORGS = new Set([
  "00000000-0000-0000-0000-000000000001",
  "00000000-0000-0000-0000-000000000002",
]);

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
    .select("role, org_id")
    .eq("user_id", user.id);
  const role = highestRole(memberships ?? []);

  // A new user has zero campaigns AND has a personal (non-shared-demo) org.
  // Show the bootstrap flow which seeds a demo campaign then redirects.
  const hasPersonalOrg = (memberships ?? []).some(
    (m) => !SHARED_DEMO_ORGS.has(m.org_id as string) && (m.role === "owner" || m.role === "director")
  );
  const hasCampaigns = (campaigns ?? []).length > 0;

  if (!hasCampaigns && hasPersonalOrg) {
    return <FirstLoginBootstrap />;
  }

  return (
    <CampaignPicker
      campaigns={(campaigns ?? []) as PickerCampaign[]}
      canManage={role === "owner" || role === "director"}
      email={user.email ?? ""}
    />
  );
}
