import { redirect } from "next/navigation";
import { Sidebar } from "@/components/sidebar";
import { Topbar } from "@/components/topbar";
import { MobileNav } from "@/components/mobile-nav";
import { createClient } from "@/utils/supabase/server";
import { getActiveCampaign } from "@/lib/campaign";
import { highestRole } from "@/lib/auth";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // No active campaign → send the user to the picker first.
  const activeCampaign = await getActiveCampaign();
  if (!activeCampaign) redirect("/select");

  // Run role + nav-badge counts in parallel. All RLS-scoped to the active campaign.
  const [membershipRes, voterCountRes, turfCountRes] = await Promise.all([
    supabase.from("memberships").select("role").eq("user_id", user.id),
    supabase
      .from("voters")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", activeCampaign.id),
    // Active turfs back the Canvassing badge (matches the "N active turfs" header).
    supabase
      .from("turfs")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", activeCampaign.id)
      .eq("status", "active"),
  ]);
  const role = highestRole(membershipRes.data);
  const voterCount = voterCountRes.count ?? 0;
  const turfCount = turfCountRes.count ?? 0;

  return (
    <div className="app density-cozy">
      <Sidebar
        role={role}
        email={user.email ?? ""}
        activeCampaign={activeCampaign.candidate}
        activeCampaignPhoto={activeCampaign.photo_url ?? ""}
        voterCount={voterCount}
        turfCount={turfCount}
      />
      <Topbar />
      <main className="canvas">{children}</main>
      <MobileNav role={role} />
    </div>
  );
}
