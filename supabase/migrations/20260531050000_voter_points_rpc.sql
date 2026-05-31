-- CANDI — Feature 2: voter_points RPC for the turf map.
--
-- Returns the campaign's geocoded voters as plottable points for the Mapbox
-- circle layer. Selecting raw `geom` over PostgREST yields WKB hex, so we project
-- to lng/lat via ST_X/ST_Y. The map then filters (party / super-voter / support)
-- and ray-casts point-in-polygon CLIENT-SIDE for live doors-vs-people counts.
--
-- SECURITY DEFINER so it can read voters regardless of the caller's direct table
-- grants, but it is RLS-equivalent: it only returns rows for campaigns the caller
-- belongs to (p_campaign must be in user_campaign_ids()). search_path is pinned.

create or replace function public.voter_points(p_campaign uuid)
returns table (
  external_id text,
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
    -- RLS-equivalent guard: caller must be a member of this campaign's org.
    and p_campaign in (select public.user_campaign_ids())
$$;
