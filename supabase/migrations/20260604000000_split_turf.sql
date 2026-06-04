-- CANDI — split a turf into N vertical strips.
--
-- Takes a saved turf and divides its bounding box into N equal-width longitude
-- strips, each a new turf named "<orig> · k", with voter/door counts computed
-- server-side via ST_Contains. The original turf is deleted (it BECOMES the N
-- children). RLS-equivalent: caller must belong to the campaign's org.
--
-- Idempotent (CREATE OR REPLACE).

create or replace function public.split_turf(p_campaign uuid, p_turf uuid, p_n int)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  b    geometry;
  nm   text;
  xmin double precision; xmax double precision;
  ymin double precision; ymax double precision;
  w    double precision;
  i    int;
  created int := 0;
  strip geometry;
  vc int; dc int;
begin
  -- RLS-equivalent guard.
  if p_campaign not in (select public.user_campaign_ids()) then
    raise exception 'not authorized for campaign %', p_campaign using errcode = '42501';
  end if;
  if p_n < 2 or p_n > 12 then
    raise exception 'split count must be between 2 and 12';
  end if;

  select boundary, name into b, nm
  from public.turfs
  where id = p_turf and campaign_id = p_campaign;

  if b is null then
    raise exception 'turf not found or has no boundary';
  end if;

  xmin := st_xmin(b); xmax := st_xmax(b);
  ymin := st_ymin(b); ymax := st_ymax(b);
  w := (xmax - xmin) / p_n;

  for i in 0 .. p_n - 1 loop
    -- Each child is a vertical strip of the original bbox (always a Polygon,
    -- so it fits geometry(Polygon,4326)).
    strip := st_setsrid(
      st_makeenvelope(xmin + i * w, ymin, xmin + (i + 1) * w, ymax, 4326),
      4326
    );

    select count(*) into vc
    from public.voters v
    where v.campaign_id = p_campaign and v.geom is not null and st_contains(strip, v.geom);

    select count(distinct lower(trim(coalesce(v.address, v.external_id)))) into dc
    from public.voters v
    where v.campaign_id = p_campaign and v.geom is not null and st_contains(strip, v.geom);

    insert into public.turfs (campaign_id, name, status, boundary, voter_count, door_count)
    values (p_campaign, nm || ' · ' || (i + 1), 'queued', strip, coalesce(vc, 0), coalesce(dc, 0));

    created := created + 1;
  end loop;

  -- The original turf is replaced by its children.
  delete from public.turfs where id = p_turf and campaign_id = p_campaign;

  return created;
end $$;
