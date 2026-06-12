import { redirect } from "next/navigation";
import { getActiveCampaign } from "@/lib/campaign";
import { getRole, isAdminRole } from "@/lib/auth";
import { TeamView } from "@/components/team/team-view";
import { listTeam } from "./actions";

export const dynamic = "force-dynamic";

export default async function TeamPage() {
  const campaign = await getActiveCampaign();
  if (!campaign) redirect("/select");

  // Org-SCOPED role gate: only owners/directors of the ACTIVE campaign's org
  // get the team surface. An owner of some other org (or a canvasser here) is
  // sent home — same consultant-model rule the select actions enforce.
  const role = await getRole({ orgId: campaign.org_id });
  if (!isAdminRole(role)) redirect("/");

  const team = await listTeam();
  return <TeamView team={team} />;
}
