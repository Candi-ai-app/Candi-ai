-- CANDI — Feature 1 (super-voter filters): voter demographics + per-election history.
--
-- Adds race / gender / registration_date, and migrates `voters.vote_history` from
-- the legacy `{label}` shape to `{label, history:{ "<code>": bool }}` so the
-- "voted in at least N of last M elections" filter (client-side, see
-- lib/elections.ts) has real per-election data. Recent elections (most-recent
-- first): 2024G, 2022G, 2020G, 2018G.
--
-- Idempotent. The backfill is DETERMINISTIC (hash of voters.id) so re-running it
-- and seeding a fresh DB both produce the same, stable assignment — and the
-- vote_history.label always matches the history counts it is rebuilt from.

-- ── Columns ──────────────────────────────────────────────────────────────────
alter table public.voters
  add column if not exists race text,
  add column if not exists gender text,
  add column if not exists registration_date date;

-- ── Indexes (campaign-scoped facets) ─────────────────────────────────────────
create index if not exists voters_campaign_race_idx   on public.voters (campaign_id, race);
create index if not exists voters_campaign_gender_idx on public.voters (campaign_id, gender);

-- ── Deterministic backfill of existing rows ──────────────────────────────────
-- Race / gender / per-election history are derived from a stable hash of the
-- row id, so already-seeded campaigns (Reyes …010 + any onboarding-created set)
-- get full, reproducible filter data. Plausible / Broward-leaning distributions.
--
-- Per-election turnout: older voters and "perfect/100%"-flavored rows vote more.
-- We use 4 independent hash bits with per-election thresholds tuned so that
-- "3 of last 4" (super voters) lands as a realistic minority.

with src as (
  select
    id,
    -- one stable 64-bit hash, sliced into independent unsigned buckets
    abs(hashtextextended(id::text, 0))                      as h_race,
    abs(hashtextextended(id::text, 11))                     as h_gender,
    abs(hashtextextended(id::text, 21)) % 100               as e0,  -- 2024G
    abs(hashtextextended(id::text, 22)) % 100               as e1,  -- 2022G
    abs(hashtextextended(id::text, 23)) % 100               as e2,  -- 2020G
    abs(hashtextextended(id::text, 24)) % 100               as e3,  -- 2018G
    abs(hashtextextended(id::text, 31)) % 3650              as reg_days,
    coalesce(age, 0)                                        as age
  from public.voters
),
calc as (
  select
    id,
    -- Race: Broward-leaning plausible mix (White 38 / Black 30 / Hispanic 22 / Asian 5 / Other 5)
    case
      when h_race % 100 < 38 then 'White'
      when h_race % 100 < 68 then 'Black'
      when h_race % 100 < 90 then 'Hispanic/Latino'
      when h_race % 100 < 95 then 'Asian'
      else 'Other'
    end as race,
    -- Gender: M 48 / F 49 / X 3
    case
      when h_gender % 100 < 48 then 'M'
      when h_gender % 100 < 97 then 'F'
      else 'X'
    end as gender,
    -- Per-election turnout, age-boosted (older → likelier). General-election
    -- propensity decays slightly for older cycles. Thresholds chosen so ~25-35%
    -- of voters clear 3-of-4.
    (e0 < (52 + least(age, 80) * 0.35)) as v2024,
    (e1 < (48 + least(age, 80) * 0.35)) as v2022,
    (e2 < (44 + least(age, 80) * 0.35)) as v2020,
    (e3 < (40 + least(age, 80) * 0.35)) as v2018,
    (current_date - reg_days::int) as registration_date
  from src
),
final as (
  select
    id, race, gender, registration_date,
    v2024, v2022, v2020, v2018,
    (v2024::int + v2022::int + v2020::int + v2018::int) as got
  from calc
)
update public.voters v
set
  race = f.race,
  gender = f.gender,
  registration_date = f.registration_date,
  vote_history = jsonb_build_object(
    'label', round(f.got * 100.0 / 4) || '% (' || f.got || '/4)',
    'history', jsonb_build_object(
      '2024G', f.v2024,
      '2022G', f.v2022,
      '2020G', f.v2020,
      '2018G', f.v2018
    )
  )
from final f
where v.id = f.id;
