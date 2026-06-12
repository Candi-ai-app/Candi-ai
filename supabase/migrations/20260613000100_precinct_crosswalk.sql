-- CANDI — Data-driven precinct crosswalk table.
--
-- Moves the Broward 2026 old→new precinct renumber crosswalk out of the
-- hardcoded VALUES CTEs in precinct_stats and form_voters and into a proper
-- reference table (public.precinct_crosswalk). Both RPCs are re-created to
-- look up the crosswalk from this table instead.
--
-- The county filter in both RPCs is currently hard-coded to 'Broward' because
-- voters don't carry a county column yet — a single campaign's voters all belong
-- to one county, and campaign …030 (Easton Harrison) is Broward. When a county
-- column is added to voters or when multi-county support arrives, replace the
-- literal 'Broward' with a join or a new parameter.
--
-- ── Crosswalk table ──────────────────────────────────────────────────────────

create table if not exists public.precinct_crosswalk (
  county    text not null,
  old_code  text not null,
  new_code  text not null,
  primary key (county, old_code)
);

alter table public.precinct_crosswalk enable row level security;

-- Reference data: read-only for every authenticated user; no write policies.
drop policy if exists precinct_crosswalk_read on public.precinct_crosswalk;
create policy precinct_crosswalk_read on public.precinct_crosswalk for select
  to authenticated
  using (true);

-- ── Seed: the 12 Broward 2026 renumber pairs ─────────────────────────────────
-- Copied verbatim from the VALUES list in the original precinct_stats RPC
-- (migration 20260611000000_precincts.sql). Only retired codes (absent from the
-- 2026 set) appear here — current-vintage precinct codes are never remapped.

insert into public.precinct_crosswalk (county, old_code, new_code)
values
  ('Broward', 'A016', 'A008'),
  ('Broward', 'D010', 'D009'),
  ('Broward', 'F009', 'F006'),
  ('Broward', 'K007', 'K006'),
  ('Broward', 'K008', 'K001'),
  ('Broward', 'M018', 'M010'),
  ('Broward', 'R043', 'R023'),
  ('Broward', 'R044', 'R035'),
  ('Broward', 'R045', 'R003'),
  ('Broward', 'R046', 'R021'),
  ('Broward', 'R047', 'R024'),
  ('Broward', 'T024', 'T005')
on conflict (county, old_code) do update set new_code = excluded.new_code;

-- ── precinct_stats: look up crosswalk from table ──────────────────────────────

create or replace function public.precinct_stats(p_campaign uuid)
returns table (precinct text, voters integer, supporters integer)
language sql
stable
security definer
set search_path = public
as $$
  -- NOTE: county is hard-coded to 'Broward' because voters don't carry a county
  -- column yet. All current campaigns are single-county, and every real voter
  -- file loaded so far (campaign …030, Easton Harrison) is Broward County.
  -- Replace the literal when county-per-voter support lands.
  with renames as (
    select old_code, new_code
    from public.precinct_crosswalk
    where county = 'Broward'
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

-- ── form_voters: look up crosswalk from table ─────────────────────────────────

create or replace function public.form_voters(p_campaign uuid, p_precinct text, p_limit int default 500)
returns table (
  id              uuid,
  first_name      text,
  last_name       text,
  address         text,
  city            text,
  state           text,
  zip             text,
  phone           text,
  email           text,
  mailing_address text,
  precinct        text
)
language sql
stable
security definer
set search_path = public
as $$
  -- NOTE: same 'Broward' hard-coding as precinct_stats above.
  with renames as (
    select old_code, new_code
    from public.precinct_crosswalk
    where county = 'Broward'
  ),
  base as (
    select
      v.id, v.first_name, v.last_name, v.address, v.city, v.state, v.zip,
      v.phone, v.email, v.mailing_address, v.precinct,
      upper(trim(split_part(v.precinct, '.', 1))) as norm0
    from public.voters v
    where v.campaign_id = p_campaign
      and v.precinct is not null
      -- RLS-equivalent guard: caller must be a member of this campaign's org.
      -- The service role (already RLS-exempt on the tables) also passes, so
      -- trusted server scripts can exercise the same path.
      and (
        p_campaign in (select public.user_campaign_ids())
        or (select auth.role()) = 'service_role'
      )
  )
  select
    b.id, b.first_name, b.last_name, b.address, b.city, b.state, b.zip,
    b.phone, b.email, b.mailing_address, b.precinct
  from base b
  left join renames r on r.old_code = b.norm0
  where coalesce(r.new_code, b.norm0) = upper(trim(p_precinct))
  order by b.last_name nulls last, b.first_name nulls last, b.id
  limit least(greatest(coalesce(p_limit, 500), 1), 500)
$$;
