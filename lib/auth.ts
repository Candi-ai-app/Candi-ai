import { createClient } from "@/utils/supabase/server";

const RANK: Record<string, number> = { owner: 3, director: 2, canvasser: 1 };

/**
 * Highest-privilege role across a user's memberships. A user can belong to
 * MULTIPLE orgs (e.g. the demo org + a real campaign's org), so we must not
 * assume a single membership row — `.maybeSingle()` errors on 2+ rows and
 * silently drops the user to "canvasser". Pass rows you already fetched, or use getRole().
 */
export function highestRole(rows: { role: string | null }[] | null | undefined): string {
  let best = "canvasser";
  for (const r of rows ?? []) {
    const role = r.role ?? "";
    if ((RANK[role] ?? 0) > (RANK[best] ?? 0)) best = role;
  }
  return best;
}

/** Current signed-in user's highest role across their orgs. Defaults to "canvasser". */
export async function getRole(): Promise<string> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return "canvasser";
  const { data } = await supabase.from("memberships").select("role").eq("user_id", user.id);
  return highestRole(data);
}

/** Owners and directors get the full admin surface; canvassers are field-only. */
export function isAdminRole(role: string): boolean {
  return role === "owner" || role === "director";
}
