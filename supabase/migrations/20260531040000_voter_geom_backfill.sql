-- CANDI — Feature 2 (filtered list drives the turf): voter geom backfill.
--
-- Pins on the turf map require `voters.geom`. Onboarding-created campaigns place
-- points at insert time (see app/select/actions.ts → WKT POINT), but the original
-- "Reyes for State Senate" seed (campaign …010) predates geocoding and has 22 rows
-- with NULL geom — so the map would be empty for it.
--
-- This backfills any voter with NULL geom by placing a DETERMINISTIC point (stable
-- hash of voters.id) inside that campaign's geographic bbox. The bbox is derived
-- from campaigns.state/county mapped to the curated areas in lib/areas.ts, with a
-- fallback to the campaign's district prefix (e.g. "PA-12" → Allegheny/Pittsburgh)
-- for legacy rows whose state/county are NULL, and finally a generic bbox.
--
-- Idempotent: only touches rows where geom IS NULL, and the placement is a pure
-- function of the row id, so re-running produces the same points.

with bbox as (
  -- One bbox per campaign that still has NULL-geom voters. Match the curated
  -- lib/areas.ts boxes by state/county; fall back to the district prefix for
  -- legacy rows (the original Reyes seed is PA-12 with NULL state/county); then
  -- a generic continental-US box (mirrors the FALLBACK in app/select/actions.ts).
  select
    c.id as campaign_id,
    case
      when c.county = 'Broward County'      then array[-80.4,  26.05, -80.1,  26.3 ]
      when c.county = 'Miami-Dade County'   then array[-80.32, 25.72, -80.13, 25.86]
      when c.county = 'Allegheny County'    then array[-80.1,  40.36, -79.86, 40.52]
      when c.county = 'Philadelphia County' then array[-75.21, 39.92, -75.13, 40.0 ]
      -- legacy rows with NULL state/county: infer from the district prefix
      when c.state = 'Pennsylvania'         then array[-80.1,  40.36, -79.86, 40.52]
      when c.state = 'Florida'              then array[-80.4,  26.05, -80.1,  26.3 ]
      when c.district like 'PA-%'           then array[-80.1,  40.36, -79.86, 40.52]  -- Reyes (Pittsburgh / Allegheny)
      when c.district like 'FL-%'           then array[-80.4,  26.05, -80.1,  26.3 ]
      else array[-98.6, 39.7, -98.4, 39.9]                                            -- generic fallback
    end as box
  from public.campaigns c
  where exists (
    select 1 from public.voters v where v.campaign_id = c.id and v.geom is null
  )
),
placed as (
  select
    v.id,
    -- Two independent unsigned hash buckets in [0,1) → fractional position in box.
    (abs(hashtextextended(v.id::text, 41)) % 1000000) / 1000000.0 as fx,
    (abs(hashtextextended(v.id::text, 43)) % 1000000) / 1000000.0 as fy,
    b.box
  from public.voters v
  join bbox b on b.campaign_id = v.campaign_id
  where v.geom is null
)
update public.voters v
set geom = st_setsrid(
  st_makepoint(
    (p.box[1])::float8 + p.fx * ((p.box[3])::float8 - (p.box[1])::float8),  -- west + fx*(east-west)
    (p.box[2])::float8 + p.fy * ((p.box[4])::float8 - (p.box[2])::float8)   -- south + fy*(north-south)
  ),
  4326
)
from placed p
where v.id = p.id;
