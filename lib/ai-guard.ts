import { createClient } from "@/utils/supabase/server";

/** Require a signed-in user for an AI endpoint. Returns the user id, or null (caller returns 401). */
export async function requireUser(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

/**
 * Best-effort per-user rate limit (in-memory, per serverless instance — resets on
 * cold start). Stops a signed-in user from hammering the AI / running up cost; a
 * durable limiter (Upstash/Redis or a DB) is the production upgrade for
 * multi-instance enforcement.
 */
const HITS = new Map<string, number[]>();
export function rateLimited(userId: string, max = 20, windowMs = 60_000): boolean {
  const now = Date.now();
  const recent = (HITS.get(userId) ?? []).filter((t) => now - t < windowMs);
  recent.push(now);
  HITS.set(userId, recent);
  return recent.length > max;
}

type Usage =
  | { input_tokens?: number | null; output_tokens?: number | null; cache_read_input_tokens?: number | null }
  | null
  | undefined;

/** Structured per-request usage log (tokens / model / user) for cost monitoring. */
export function logUsage(route: string, userId: string, model: string, usage: Usage): void {
  console.log(
    JSON.stringify({
      evt: "ai_usage",
      route,
      user: userId,
      model,
      in: usage?.input_tokens ?? null,
      out: usage?.output_tokens ?? null,
      cached: usage?.cache_read_input_tokens ?? null,
    })
  );
}
