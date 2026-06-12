-- ============================================================================
-- CANDI — P2 scale-ops: durable AI rate limiting, usage audit trail, missing
-- indexes, and a schema-default cleanup. No existing rows are touched.
-- Idempotent (IF NOT EXISTS / CREATE OR REPLACE / drop-then-recreate not needed
-- here — all objects are additive). Safe to re-run.
-- ============================================================================
-- Why this exists (scale debt audited at MVP):
--   1. AI rate limiting was in-memory per serverless instance (lib/ai-guard.ts),
--      so it reset on every cold start and did NOT enforce across instances.
--      We move the counter into Postgres so the limit is durable + global.
--   2. There was no audit trail of AI usage — only ephemeral console.log lines.
--      ai_usage_log gives us a queryable per-request record (cost monitoring).
--   3. Two hot query paths (field stats by recency, contacts-by-canvasser) had
--      no supporting composite index.
--   4. precincts.county carried a DEFAULT 'Broward' that quietly made the county
--      implicit; with multi-county on the horizon it must be set explicitly.
--
-- Both ai_usage_log and ai_rate_counters are SERVER-INFRA tables: RLS is enabled
-- with NO policies, so the RLS (authenticated) client can neither read nor write
-- them. All access is via the service-role client (utils/supabase/admin.ts),
-- which bypasses RLS — see lib/ai-guard.ts.
-- ============================================================================


-- ─────────────────────────────────────────────────────────────────────────────
-- 1. ai_usage_log — queryable per-request AI usage (cost monitoring / audit)
-- ─────────────────────────────────────────────────────────────────────────────
-- One row per AI request (chat / draft / onboarding). Written by logUsage() via
-- the service role; never throws into the request path. campaign_id is nullable
-- because two of the three AI routes (draft, onboarding) don't have a campaign in
-- scope. Indexes target the two reporting axes we expect: per-campaign spend over
-- time and per-user spend over time.
create table if not exists public.ai_usage_log (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid,
  campaign_id uuid,
  route       text not null,
  model       text,
  tokens_in   int,
  tokens_out  int,
  created_at  timestamptz not null default now()
);

create index if not exists ai_usage_log_campaign_idx
  on public.ai_usage_log (campaign_id, created_at desc);
create index if not exists ai_usage_log_user_idx
  on public.ai_usage_log (user_id, created_at desc);

-- Server-infra table: RLS on, NO policies (service-role-only access for now).
alter table public.ai_usage_log enable row level security;


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. ai_rate_counters + ai_rate_hit() — durable, multi-instance rate limiting
-- ─────────────────────────────────────────────────────────────────────────────
-- A fixed-window counter keyed by (key, window_start). `key` namespaces the
-- subject of the limit (e.g. 'u:<user_id>' for per-user, 'c:<campaign_id>:d' for
-- a per-campaign daily budget); window_start is the floor of now() to the window
-- size, so all hits in the same window collapse to one row that we increment.
create table if not exists public.ai_rate_counters (
  key          text not null,
  window_start timestamptz not null,
  count        int not null default 0,
  primary key (key, window_start)
);

-- Server-infra table: RLS on, NO policies (service-role-only access).
alter table public.ai_rate_counters enable row level security;

-- ai_rate_hit(p_key, p_window_seconds, p_max) -> boolean
--   Atomically records ONE hit for p_key in the current fixed window and returns
--   whether the call is WITHIN limit (true = allowed, false = over the limit).
--
-- Atomicity: a single INSERT .. ON CONFLICT DO UPDATE statement is the whole
-- operation. The window_start is computed with to_timestamp(floor(...)) so every
-- caller in the same window contends for the SAME primary-key row; Postgres
-- serializes the conflicting upserts on that row's lock, so concurrent callers
-- each get a distinct, correctly-incremented `count` back via RETURNING. No
-- read-modify-write race, no lost updates.
--
-- Decision: the comparison is `new_count <= p_max`, i.e. p_max requests are
-- allowed per window and the (p_max+1)-th is the first to be rejected.
--
-- Cleanup: rows older than 1 hour are deleted opportunistically and cheaply, but
-- only on ~2% of calls (random()) so we don't pay a delete scan on the hot path.
-- Old per-day campaign windows therefore linger up to ~1h past the hour mark,
-- which is harmless (they're outside every active window and tiny).
create or replace function public.ai_rate_hit(
  p_key text,
  p_window_seconds int,
  p_max int
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_window_start timestamptz;
  v_count        int;
begin
  -- Floor now() to the start of the current fixed window.
  v_window_start := to_timestamp(
    floor(extract(epoch from clock_timestamp()) / p_window_seconds) * p_window_seconds
  );

  -- Single-statement upsert: insert the window row at count 1, or bump an existing
  -- one. RETURNING hands back THIS caller's post-increment count under row lock.
  insert into public.ai_rate_counters (key, window_start, count)
  values (p_key, v_window_start, 1)
  on conflict (key, window_start)
  do update set count = public.ai_rate_counters.count + 1
  returning count into v_count;

  -- Cheap opportunistic GC of stale windows (~2% of calls).
  if random() < 0.02 then
    delete from public.ai_rate_counters
    where window_start < clock_timestamp() - interval '1 hour';
  end if;

  return v_count <= p_max;
end $$;


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Missing indexes from the audit
-- ─────────────────────────────────────────────────────────────────────────────
-- field_stats (app/api/chat/route.ts) filters contacts by campaign_id + a
-- created_at >= since window and orders by created_at desc; the composite serves
-- that exactly (the existing contacts_campaign_idx is campaign-only).
create index if not exists contacts_campaign_created_idx
  on public.contacts (campaign_id, created_at desc);

-- Per-canvasser lookups (owner's real-time canvasser view / contact attribution).
create index if not exists contacts_canvasser_idx
  on public.contacts (canvasser_id);


-- ─────────────────────────────────────────────────────────────────────────────
-- 4. precincts.county — drop the implicit DEFAULT 'Broward'
-- ─────────────────────────────────────────────────────────────────────────────
-- The column stays NOT NULL; callers must now state the county explicitly rather
-- than silently inheriting 'Broward'. Existing rows are unaffected (DROP DEFAULT
-- only changes future inserts). The importer (scripts/import-precincts.mjs)
-- already writes county explicitly, so nothing legitimate breaks.
alter table public.precincts alter column county drop default;
