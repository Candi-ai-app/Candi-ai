-- CANDI — Feature 2: persist doors-vs-people counts onto a saved turf.
--
-- The turf map now computes, client-side, how many filtered voters fall inside a
-- drawn polygon (people = rows inside; doors = distinct address inside) via a
-- ray-cast point-in-polygon. saveTurf() passes those through so the saved turf
-- reflects exactly what the canvasser saw under the active filter.
--
-- create_turf gains optional p_voter_count / p_door_count. When provided (>= 0)
-- they are stored verbatim; when omitted (NULL, the legacy call shape) it falls
-- back to the original server-side ST_Contains count over ALL geocoded voters.
-- Also adds an RLS-equivalent guard now that callers use the session client.

-- Drop the legacy 2-arg overload (from 20260531000000_turf_rpc.sql). Without this
-- a fresh migration run would leave BOTH the old unguarded version and the new one,
-- making PostgREST overload resolution ambiguous and leaving a security gap.
drop function if exists public.create_turf(uuid, jsonb);

create or replace function public.create_turf(
  p_campaign uuid,
  p_geojson jsonb,
  p_voter_count int default null,
  p_door_count int default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id uuid;
  n int;
begin
  -- RLS-equivalent guard: only members of the campaign's org may create turf.
  if p_campaign not in (select public.user_campaign_ids()) then
    raise exception 'not authorized for campaign %', p_campaign using errcode = '42501';
  end if;

  select count(*) into n from public.turfs where campaign_id = p_campaign;
  insert into public.turfs (campaign_id, name, status, boundary, voter_count, door_count)
  values (
    p_campaign,
    'Turf ' || (n + 1),
    'queued',
    st_setsrid(st_geomfromgeojson(p_geojson::text), 4326),
    greatest(coalesce(p_voter_count, 0), 0),
    greatest(coalesce(p_door_count, 0), 0)
  )
  returning id into new_id;

  -- Legacy fallback: if the caller did not supply a filtered people-count, derive
  -- one server-side from all geocoded voters inside the polygon (door_count stays
  -- whatever was passed / 0, since "distinct address" is what the client sends).
  if p_voter_count is null then
    update public.turfs t
       set voter_count = (
         select count(*) from public.voters v
         where v.campaign_id = p_campaign and v.geom is not null and st_contains(t.boundary, v.geom)
       )
     where t.id = new_id;
  end if;

  return new_id;
end $$;
