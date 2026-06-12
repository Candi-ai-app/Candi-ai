import { redirect } from "next/navigation";
import { ScriptsView } from "@/components/scripts/scripts-view";
import { getRole, isAdminRole } from "@/lib/auth";
import { getActiveCampaign } from "@/lib/campaign";

export default async function ScriptsPage() {
  // Script builder edits shared campaign messaging — owners/directors only.
  // Scope the role check to the active campaign's org so an owner-in-A who is a
  // canvasser-in-B is correctly field-only on B's scripts. No active campaign →
  // fall back to the unscoped (highest-role) check.
  const campaign = await getActiveCampaign();
  const role = await getRole(campaign ? { campaignId: campaign.id } : undefined);
  if (!isAdminRole(role)) redirect("/canvassing");
  return <ScriptsView />;
}
