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
  // Use highestRole (not maybeSingle) — users in multiple orgs have multiple rows.
  // Pull org_id + the org name (embedded join, RLS-allowed: the user can read
  // both their memberships and their orgs) so we can also offer a workspace
  // picker when the user is owner/director in more than one org.
  const { data: memberships } = await supabase
    .from("memberships")
    .select("role, org_id, orgs(name)")
    .eq("user_id", user.id);
  const { highestRole, isAdminRole } = await import("@/lib/auth");
  const role = highestRole(memberships);
  if (!isAdminRole(role)) redirect("/select");

  // The orgs this user may create a campaign in (owner/director only), with
  // display names — mirrors the action's eligibility rule (createCampaign filters
  // memberships to roles owner/director). Deduped by org_id. When there's exactly
  // one, the wizard renders no picker (zero visual change); when there are
  // several, it shows a "Workspace" select that posts org_id with the form.
  type MembershipRow = {
    role: string | null;
    org_id: string | null;
    // Supabase types a to-one embed as an object, but the generated shape can be
    // an array depending on FK inference — accept either and normalise below.
    orgs?: { name: string | null } | { name: string | null }[] | null;
  };
  const orgNameSeen = new Set<string>();
  const eligibleOrgs = ((memberships ?? []) as MembershipRow[])
    .filter((m) => m.role === "owner" || m.role === "director")
    .map((m) => {
      const org = Array.isArray(m.orgs) ? m.orgs[0] : m.orgs;
      return { id: m.org_id ?? "", name: (org?.name ?? "").trim() };
    })
    .filter((o) => {
      if (!o.id || orgNameSeen.has(o.id)) return false;
      orgNameSeen.add(o.id);
      return true;
    })
    .sort((a, b) => a.name.localeCompare(b.name));

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

  return (
    <CampaignOnboarding
      areas={AREAS}
      sampleCount={SAMPLE_VOTER_COUNT}
      draft={draft}
      eligibleOrgs={eligibleOrgs}
    />
  );
}
