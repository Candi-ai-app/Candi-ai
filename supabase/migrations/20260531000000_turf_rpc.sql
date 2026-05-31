-- Turf persistence: create from a drawn GeoJSON polygon, list back as GeoJSON.
-- Called via the service-role admin client (RLS-scoping arrives with auth).

create or replace function public.create_turf(p_campaign uuid, p_geojson jsonb)
returns uuid
language plpgsql
as $$
declare
  new_id uuid;
  n int;
begin
  select count(*) into n from public.turfs where campaign_id = p_campaign;
  insert into public.turfs (campaign_id, name, status, boundary)
  values (
    p_campaign,
    'Turf ' || (n + 1),
    'queued',
    st_setsrid(st_geomfromgeojson(p_geojson::text), 4326)
  )
  returning id into new_id;

  -- auto-count voters whose geocoded point falls inside the polygon (0 until voters are geocoded)
  update public.turfs t
     set voter_count = (
       select count(*) from public.voters v
       where v.campaign_id = p_campaign and v.geom is not null and st_contains(t.boundary, v.geom)
     )
   where t.id = new_id;

  return new_id;
end $$;

create or replace function public.list_turfs(p_campaign uuid)
returns table (id uuid, name text, status text, voter_count int, door_count int, boundary jsonb)
language sql
stable
as $$
  select id, name, status, voter_count, door_count, st_asgeojson(boundary)::jsonb
  from public.turfs
  where campaign_id = p_campaign and boundary is not null
  order by created_at desc
$$;

-- A demo turf so the map shows persisted data on load (Lauderdale Lakes, Broward).
insert into public.turfs (id, campaign_id, name, status, boundary)
values (
  '000000a1-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000010',
  'Lauderdale Lakes · Central',
  'active',
  st_setsrid(st_geomfromtext('POLYGON((-80.215 26.155, -80.195 26.155, -80.195 26.175, -80.215 26.175, -80.215 26.155))'), 4326)
)
on conflict (id) do nothing;
