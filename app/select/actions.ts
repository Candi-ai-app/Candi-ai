"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { CAMPAIGN_COOKIE } from "@/lib/campaign";

const COOKIE_OPTS = {
  httpOnly: true as const,
  sameSite: "lax" as const,
  path: "/",
  secure: process.env.NODE_ENV === "production",
  // ~1 year — long-lived selection; cleared on sign-out.
  maxAge: 60 * 60 * 24 * 365,
};

/** Select a campaign the user can access and make it active. */
export async function selectCampaign(id: string) {
  const supabase = await createClient();

  // RLS-scoped: only returns the row if the user is a member of its org.
  const { data: campaign } = await supabase
    .from("campaigns")
    .select("id")
    .eq("id", id)
    .maybeSingle();

  if (!campaign) redirect("/select");

  const c = await cookies();
  c.set(CAMPAIGN_COOKIE, campaign.id as string, COOKIE_OPTS);
  redirect("/");
}

/** Create a new campaign (owners/directors only) and make it active. */
export async function createCampaign(formData: FormData) {
  const candidate = String(formData.get("candidate") ?? "").trim();
  const office = String(formData.get("office") ?? "").trim();
  const district = String(formData.get("district") ?? "").trim();
  const electionDate = String(formData.get("election_date") ?? "").trim();

  if (!candidate) redirect("/select");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Only owners/directors may create campaigns. Pick the first org where the
  // user holds one of those roles (sufficient for the demo).
  const { data: membership } = await supabase
    .from("memberships")
    .select("org_id, role")
    .eq("user_id", user.id)
    .in("role", ["owner", "director"])
    .limit(1)
    .maybeSingle();

  if (!membership) redirect("/select");

  const { data: created, error } = await supabase
    .from("campaigns")
    .insert({
      org_id: membership.org_id as string,
      candidate,
      office: office || null,
      district: district || null,
      election_date: electionDate || null,
    })
    .select("id")
    .single();

  if (error || !created) {
    console.error("createCampaign:", error?.message);
    redirect("/select");
  }

  const c = await cookies();
  c.set(CAMPAIGN_COOKIE, created.id as string, COOKIE_OPTS);
  redirect("/");
}
