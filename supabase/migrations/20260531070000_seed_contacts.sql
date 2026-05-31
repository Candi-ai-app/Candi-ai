-- CANDI — Feature 3: seed a realistic recent-activity `contacts` set so the live
-- HQ dashboard (KPIs, "Knock velocity" chart, "Canvassers in field") has real data.
--
-- Generic + data-driven: inserts contacts for EVERY campaign that has voters,
-- choosing a canvasser membership in that campaign's org (role='canvasser',
-- falling back to ANY membership in the org). This covers the Reyes demo
-- (…010) and the larger seeded campaigns without hardcoding ids.
--
-- Shape per campaign:
--   • each voter gets 0–3 contact "slots" (weighted so most voters have ≥1),
--   • channel mostly 'door' (~78%), plus some 'text' / 'call',
--   • result ∈ supporter | undecided | not-home | refused | lit-dropped,
--   • support 0–5 correlated with result (supporters high, refused low),
--   • created_at spread across the last 14 days, weighted toward recent days,
--     with a slice landing TODAY so "doors knocked today" is non-zero.
-- Targets a few hundred rows total so the chart + KPIs are non-trivial.
--
-- Idempotent / safe to re-run: each campaign is skipped if it already has any
-- contacts (guard below), so re-running never duplicates. To re-seed, delete a
-- campaign's contacts first.
--
-- Determinism: row values derive from setseed(0.42) + per-row hashes, so a given
-- voter/slot always produces the same channel/result/support. The only moving
-- part is `now()` (the 14-day window slides), which is intended for a live demo.

do $$
declare
  c record;          -- campaign loop var
  canv uuid;         -- chosen canvasser membership for the campaign's org
  inserted int;
begin
  for c in
    select cm.id as campaign_id, cm.org_id
    from public.campaigns cm
    where exists (select 1 from public.voters v where v.campaign_id = cm.id)
  loop
    -- Skip campaigns that already have activity (idempotent re-run guard).
    if exists (select 1 from public.contacts ct where ct.campaign_id = c.campaign_id) then
      raise notice 'campaign % already has contacts — skipping', c.campaign_id;
      continue;
    end if;

    -- Canvasser membership in this campaign's org; fall back to any membership.
    select m.id into canv
    from public.memberships m
    where m.org_id = c.org_id
    order by (m.role = 'canvasser') desc, m.created_at asc
    limit 1;

    if canv is null then
      raise notice 'campaign % has no membership in its org — skipping', c.campaign_id;
      continue;
    end if;

    -- Deterministic randomness per campaign run.
    perform setseed(0.42);

    with slots as (
      -- 0–3 contact slots per voter; ~70% of voters get ≥1 (skip slot 0 sometimes).
      select v.id as voter_id,
             v.support as voter_support,
             gs as slot,
             -- stable per (voter,slot) pseudo-random in [0,1)
             ('x' || substr(md5(v.id::text || ':' || gs::text), 1, 8))::bit(32)::bigint / 4294967295.0 as r
      from public.voters v
      cross join generate_series(0, 3) gs
      where v.campaign_id = c.campaign_id
    ),
    kept as (
      -- Keep slot 0 for ~72% of voters; higher slots progressively rarer → ~1.3 avg.
      select *
      from slots
      where (slot = 0 and r < 0.72)
         or (slot = 1 and r < 0.38)
         or (slot = 2 and r < 0.16)
         or (slot = 3 and r < 0.06)
    ),
    shaped as (
      select
        voter_id,
        -- day offset 0..13, weighted toward recent but spanning the full window.
        -- Independent hash (':d:') so recency is decoupled from channel/result; the
        -- gentle 1.25 exponent keeps a few rows today and a tail out to ~13 days ago.
        floor(
          power(
            (('x' || substr(md5(voter_id::text || ':d:' || slot::text), 1, 8))::bit(32)::bigint / 4294967295.0),
            1.25
          ) * 14
        )::int as day_offset,
        -- channel: ~78% door, ~13% text, ~9% call
        case
          when r < 0.78 then 'door'
          when r < 0.91 then 'text'
          else 'call'
        end as channel,
        -- result bucket from a third hash so it's independent of day + channel draws
        (('x' || substr(md5(voter_id::text || ':r:' || slot::text), 1, 8))::bit(32)::bigint / 4294967295.0) as rr,
        voter_support
      from kept
    )
    insert into public.contacts
      (campaign_id, voter_id, canvasser_id, channel, result, support, notes, created_at)
    select
      c.campaign_id,
      voter_id,
      canv,
      channel,
      res.result,
      res.support,
      null,
      -- spread within the chosen day: random hour 9:00–20:59 + random minutes,
      -- clamped so "today" rows never land in the future.
      least(
        now(),
        date_trunc('day', now())
          - (day_offset || ' days')::interval
          + ((9 + floor(rr * 12))::int || ' hours')::interval
          + (floor(rr * 60)::int || ' minutes')::interval
      ) as created_at
    from shaped
    cross join lateral (
      -- result + correlated support. Doors that reach a voter ID support; texts/calls
      -- skew toward not-home/undecided. Buckets keyed off rr.
      select
        case
          when channel <> 'door' and rr < 0.45 then 'not-home'
          when rr < 0.22 then 'supporter'
          when rr < 0.42 then 'undecided'
          when rr < 0.70 then 'not-home'
          when rr < 0.82 then 'refused'
          else 'lit-dropped'
        end as result,
        case
          when rr < 0.22 then (4 + floor(rr / 0.22 * 2))::smallint           -- supporter → 4–5
          when rr < 0.42 then 3::smallint                                    -- undecided → 3
          when rr < 0.70 then null                                           -- not-home → unknown
          when rr < 0.82 then (floor(rr * 2))::smallint                      -- refused → 0–1
          else 2::smallint                                                   -- lit-dropped → 2
        end as support
    ) res;

    get diagnostics inserted = row_count;
    raise notice 'campaign %: inserted % contacts (canvasser %)', c.campaign_id, inserted, canv;

    -- Assign up to 2 unassigned turfs to the canvasser so "Canvassers in field"
    -- has a turf to show. Only touches NULL-assignee turfs in this campaign.
    update public.turfs t
       set assignee_id = canv,
           status = case when t.status = 'queued' then 'active' else t.status end
     where t.id in (
       select id from public.turfs
       where campaign_id = c.campaign_id and assignee_id is null
       order by created_at asc
       limit 2
     );
  end loop;
end $$;
