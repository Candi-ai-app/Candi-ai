-- CANDI — add voter name to the voter_points RPC.
--
-- The turf map now shows a hover tooltip (name + address) on each voter dot and
-- lets you click through to that voter's record (keyed by external_id, which the
-- /voters view already uses as its row id). Adding first_name / last_name lets the
-- map render the tooltip without a second fetch.
--
-- Return-table shape changes, so DROP first (CREATE OR REPLACE can't alter it).

drop function if exists public.voter_points(uuid);

create or replace function public.voter_points(p_campaign uuid)
returns table (
  external_id text,
  first_name  text,
  last_name   text,
  lng         double precision,
  lat         double precision,
  party       text,
  support     smallint,
  precinct    text,
  address     text,
  race        text,
  gender      text,
  flags       text[],
  history     jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  select
    v.external_id,
    v.first_name,
    v.last_name,
    st_x(v.geom)            as lng,
    st_y(v.geom)            as lat,
    v.party,
    v.support,
    v.precinct,
    v.address,
    v.race,
    v.gender,
    v.flags,
    v.vote_history -> 'history' as history
  from public.voters v
  where v.campaign_id = p_campaign
    and v.geom is not null
    and p_campaign in (select public.user_campaign_ids())
$$;
