import { createClient } from "@/utils/supabase/server";

/** Current signed-in user's role on their org. Defaults to "canvasser" (least privilege). */
export async function getRole(): Promise<string> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return "canvasser";
  const { data } = await supabase
    .from("memberships")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();
  return (data?.role as string) ?? "canvasser";
}

/** Owners and directors get the full admin surface; canvassers are field-only. */
export function isAdminRole(role: string): boolean {
  return role === "owner" || role === "director";
}
