import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";

/** Cookie that stores the user's active campaign id across requests. */
export const CAMPAIGN_COOKIE = "candi_campaign";

export type ActiveCampaign = {
  id: string;
  org_id: string;
  candidate: string;
  office: string | null;
  district: string | null;
  election_date: string | null;
};

/** The active campaign id from the cookie, or null if none is selected. */
export async function getActiveCampaignId(): Promise<string | null> {
  const c = await cookies();
  return c.get(CAMPAIGN_COOKIE)?.value ?? null;
}

/**
 * The active campaign row, scoped by RLS to the campaigns the signed-in user
 * can access. Returns null if no campaign is selected or it is not accessible.
 */
export async function getActiveCampaign(): Promise<ActiveCampaign | null> {
  const id = await getActiveCampaignId();
  if (!id) return null;

  const supabase = await createClient();
  const { data } = await supabase
    .from("campaigns")
    .select("id, org_id, candidate, office, district, election_date")
    .eq("id", id)
    .maybeSingle();

  return (data as ActiveCampaign | null) ?? null;
}
