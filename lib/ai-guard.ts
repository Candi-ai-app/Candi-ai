import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";

/** Require a signed-in user for an AI endpoint. Returns the user id, or null (caller returns 401). */
export async function requireUser(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

// ── Rate-limit tunables (unchanged from the previous in-memory limiter) ────────
// Per-user: MAX requests per WINDOW_SECONDS. Was max=20 / 60_000ms in-memory.
const USER_MAX = 20;
const USER_WINDOW_SECONDS = 60;
// Per-campaign daily budget: a generous coarse cap so one campaign can't run up
// unbounded spend in a day. Request-count based on purpose; token-based budgeting
// is future work (we already record tokens in ai_usage_log to inform it later).
const CAMPAIGN_DAILY_MAX = 300;
const CAMPAIGN_WINDOW_SECONDS = 86_400;

/**
 * Durable, multi-instance per-user (and optional per-campaign/day) rate limit.
 *
 * Backed by the Postgres function public.ai_rate_hit (migration
 * 20260613000300_scale_ops.sql) via the service-role client, so the counter is
 * shared across every serverless instance and survives cold starts — unlike the
 * old in-memory Map, which reset per instance and didn't enforce globally.
 *
 * Signature is source-compatible with the previous limiter except it is now async
 * (a DB round-trip is unavoidable for durability) and takes an optional campaignId.
 * Returns true when the request is OVER the limit (caller should 429), matching
 * the old contract. The max/windowMs params are accepted for compatibility; the
 * durable per-user window is driven by USER_MAX / USER_WINDOW_SECONDS.
 *
 * FAIL-OPEN: if the DB call errors we ALLOW the request and console.error. We
 * choose availability over strict enforcement — a transient DB hiccup must not
 * take Ask Candi / drafting offline. (The hard caps inside each route — MAX_TURNS,
 * MAX_TOKENS — still bound per-request cost regardless.)
 */
export async function rateLimited(
  userId: string,
  _max = USER_MAX,
  _windowMs = USER_WINDOW_SECONDS * 1000,
  campaignId?: string | null
): Promise<boolean> {
  const admin = createAdminClient();

  // Per-user limit (always enforced).
  try {
    const { data, error } = await admin.rpc("ai_rate_hit", {
      p_key: `u:${userId}`,
      p_window_seconds: USER_WINDOW_SECONDS,
      p_max: USER_MAX,
    });
    if (error) {
      console.error("[ai-guard] rateLimited user check failed (fail-open):", error.message);
    } else if (data === false) {
      // Within the user window we're over the per-user cap → limit.
      return true;
    }
  } catch (e) {
    console.error("[ai-guard] rateLimited user check threw (fail-open):", e);
  }

  // Per-campaign daily budget (only when a campaign id is in scope for the caller).
  if (campaignId) {
    try {
      const { data, error } = await admin.rpc("ai_rate_hit", {
        p_key: `c:${campaignId}:d`,
        p_window_seconds: CAMPAIGN_WINDOW_SECONDS,
        p_max: CAMPAIGN_DAILY_MAX,
      });
      if (error) {
        console.error("[ai-guard] rateLimited campaign check failed (fail-open):", error.message);
      } else if (data === false) {
        return true;
      }
    } catch (e) {
      console.error("[ai-guard] rateLimited campaign check threw (fail-open):", e);
    }
  }

  return false;
}

type Usage =
  | { input_tokens?: number | null; output_tokens?: number | null; cache_read_input_tokens?: number | null }
  | null
  | undefined;

/**
 * Structured per-request usage record (tokens / model / user / campaign) for cost
 * monitoring. Keeps the existing console.log line AND now durably inserts one row
 * into public.ai_usage_log via the service role (queryable audit trail).
 *
 * NEVER throws into the request path: logging is best-effort. The DB insert is
 * fired and its failure is swallowed (console.error only) so a logging hiccup
 * can't break an otherwise-successful AI response. campaignId is optional because
 * two of the three AI routes (draft, onboarding) have no campaign in scope.
 */
export function logUsage(
  route: string,
  userId: string,
  model: string,
  usage: Usage,
  campaignId?: string | null
): void {
  const tokensIn = usage?.input_tokens ?? null;
  const tokensOut = usage?.output_tokens ?? null;

  console.log(
    JSON.stringify({
      evt: "ai_usage",
      route,
      user: userId,
      campaign: campaignId ?? null,
      model,
      in: tokensIn,
      out: tokensOut,
      cached: usage?.cache_read_input_tokens ?? null,
    })
  );

  // Best-effort durable audit row. Fire-and-forget; never throw.
  try {
    const admin = createAdminClient();
    void admin
      .from("ai_usage_log")
      .insert({
        user_id: userId,
        campaign_id: campaignId ?? null,
        route,
        model,
        tokens_in: tokensIn,
        tokens_out: tokensOut,
      })
      .then(({ error }) => {
        if (error) console.error("[ai-guard] logUsage insert failed:", error.message);
      });
  } catch (e) {
    console.error("[ai-guard] logUsage threw (ignored):", e);
  }
}
