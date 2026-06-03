-- CANDI — turf walking routes.
--
-- "Generate route" optimizes a walking order over the doors inside a turf
-- (nearest-neighbor + 2-opt, computed client-side) and stores the ordered stops
-- here so a route can be assigned to a canvasser and (later) followed in the
-- GPS field app. Stops are a JSON array: [{ "lng": n, "lat": n, "address": "…" }, …].

alter table public.turfs add column if not exists route jsonb;

-- Extend list_turfs to return the stored route alongside the boundary so the map
-- can redraw the route line on load (not just right after generation).
-- DROP first: CREATE OR REPLACE can't change a function's return-table shape.
drop function if exists public.list_turfs(uuid);
create or replace function public.list_turfs(p_campaign uuid)
returns table (id uuid, name text, status text, voter_count int, door_count int, boundary jsonb, route jsonb)
language sql
stable
as $$
  select id, name, status, voter_count, door_count, st_asgeojson(boundary)::jsonb, route
  from public.turfs
  where campaign_id = p_campaign and boundary is not null
  order by created_at desc
$$;
