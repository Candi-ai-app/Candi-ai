-- CANDI — Broward County precinct boundaries (public reference data).
--
-- `precincts` stores official county precinct polygons (2026 vintage, published
-- by Broward County GIS — 346 precincts). Unlike every other table this is NOT
-- campaign-scoped: boundaries are public reference data shared by all campaigns,
-- so RLS grants read-only access to any authenticated user and there is no
-- insert/update policy — writes happen exclusively via the service role
-- (scripts/import-precincts.mjs), which bypasses RLS.
--
-- Source polygons mix Polygon and MultiPolygon; the importer coerces everything
-- to MultiPolygon with ST_Multi (and repairs any simplification artifacts via
-- ST_MakeValid) so the typed geometry column stays uniform.
--
-- `precinct_stats` powers the map overlay popup: per-precinct voter + supporter
-- counts ("supporters" = voters scored 4–5, the same definition HQ uses).
-- Aggregation happens in SQL because supabase-js caps selects at 1000 rows.
-- SECURITY DEFINER but RLS-equivalent, mirroring public.voter_points: it only
-- returns rows when p_campaign is in user_campaign_ids().
--
-- Precinct-code normalization (the SoE voter file predates the 2026 renumber):
--   • split suffixes collapse to the parent precinct ("K002.1" → K002);
--   • retired pre-2026 codes map to their 2026 successor using the county's own
--     OLD_PRECINCT crosswalk (e.g. old K007 merged into 2026 K006, old K008
--     into 2026 K001). Only codes that no longer exist in 2026 are remapped,
--     so a current-vintage file is never mis-translated.

create table if not exists public.precincts (
  id     uuid primary key default gen_random_uuid(),
  county text not null default 'Broward',
  code   text not null,
  geom   geometry(MultiPolygon, 4326) not null,
  unique (county, code)
);

create index if not exists precincts_geom_idx
  on public.precincts using gist (geom);

alter table public.precincts enable row level security;

-- Read-only for every signed-in user; no write policies on purpose.
drop policy if exists precincts_read on public.precincts;
create policy precincts_read on public.precincts for select
  to authenticated
  using (true);

-- Per-precinct voter + supporter counts for a campaign, keyed by the 2026
-- precinct code so the client can join straight onto the GeoJSON PRECINCT
-- property. Voters with no precinct on file are excluded; codes that match no
-- 2026 polygon (e.g. synthetic demo codes like "SD35-A") still come back and
-- simply find no polygon to join to.
create or replace function public.precinct_stats(p_campaign uuid)
returns table (precinct text, voters integer, supporters integer)
language sql
stable
security definer
set search_path = public
as $$
  -- Broward 2026 renumber crosswalk, derived from the county GIS layer's
  -- OLD_PRECINCT field: every retired code (absent from the 2026 set) → the
  -- 2026 precinct that absorbed it.
  with renames(old_code, new_code) as (
    values
      ('A016', 'A008'),
      ('D010', 'D009'),
      ('F009', 'F006'),
      ('K007', 'K006'),
      ('K008', 'K001'),
      ('M018', 'M010'),
      ('R043', 'R023'),
      ('R044', 'R035'),
      ('R045', 'R003'),
      ('R046', 'R021'),
      ('R047', 'R024'),
      ('T024', 'T005')
  ),
  base as (
    select
      -- "K002.1" → "K002": split suffixes collapse to the parent precinct.
      upper(trim(split_part(v.precinct, '.', 1))) as code,
      v.support
    from public.voters v
    where v.campaign_id = p_campaign
      and v.precinct is not null
      -- RLS-equivalent guard: caller must be a member of this campaign's org.
      and p_campaign in (select public.user_campaign_ids())
  )
  select
    coalesce(r.new_code, b.code)                  as precinct,
    count(*)::int                                 as voters,
    (count(*) filter (where b.support >= 4))::int as supporters
  from base b
  left join renames r on r.old_code = b.code
  group by 1
$$;
