-- CANDI — "Ask Candi" data-grounded analyst: read-only voter analytics RPCs.
--
-- Powers the Anthropic tool-use loop in app/api/chat/route.ts. Two functions give
-- the assistant EXACT, campaign-scoped figures it can quote verbatim instead of
-- guessing:
--
--   • campaign_voter_breakdown(p_campaign, p_dimension)
--       GROUP BY one dimension (party | race | gender | precinct | support),
--       returning {bucket -> count}. One aggregate query, so it is correct at the
--       real campaign's ~18.9k scale (PostgREST row fetches cap at 1000 and would
--       silently under-count — exactly the bug this avoids).
--
--   • campaign_count_voters(...)
--       A single, fully-parameterized COUNT for the count_voters tool. Most filters
--       (party/race/gender/precinct/min_support/flag) are trivial in PostgREST, but
--       the "super voter" rule sums FOUR jsonb booleans (voted in >= N of the last M
--       recent generals) — arithmetic PostgREST cannot express as one head-count.
--       Doing the whole count in SQL keeps it exact, scalable, and in one round-trip.
--
-- Both are SECURITY DEFINER (so they work regardless of the caller's direct table
-- grants) but RLS-EQUIVALENT: they refuse any campaign not in user_campaign_ids(),
-- and search_path is pinned. They are READ-ONLY (stable, no writes). Recent generals
-- mirror lib/elections.ts (most-recent-first): 2024G, 2022G, 2020G, 2018G.
--
-- Idempotent (create or replace + explicit drops for shape changes).

-- ── Breakdown: GROUP BY one whitelisted dimension ────────────────────────────
drop function if exists public.campaign_voter_breakdown(uuid, text);

create or replace function public.campaign_voter_breakdown(
  p_campaign  uuid,
  p_dimension text
)
returns table (bucket text, n bigint)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  -- RLS-equivalent guard: caller must belong to this campaign's org.
  if p_campaign is null or not (p_campaign in (select public.user_campaign_ids())) then
    return;  -- no rows → tool reports an empty result + asks the user to pick a campaign
  end if;

  -- Whitelist the dimension (the column is interpolated, so this MUST stay a
  -- closed enum — never pass user text straight through).
  if p_dimension = 'party' then
    return query
      select coalesce(v.party, 'Unknown')::text, count(*)::bigint
      from public.voters v where v.campaign_id = p_campaign
      group by 1 order by 2 desc;
  elsif p_dimension = 'race' then
    return query
      select coalesce(v.race, 'Unknown')::text, count(*)::bigint
      from public.voters v where v.campaign_id = p_campaign
      group by 1 order by 2 desc;
  elsif p_dimension = 'gender' then
    return query
      select coalesce(v.gender, 'Unknown')::text, count(*)::bigint
      from public.voters v where v.campaign_id = p_campaign
      group by 1 order by 2 desc;
  elsif p_dimension = 'precinct' then
    return query
      select coalesce(v.precinct, 'Unknown')::text, count(*)::bigint
      from public.voters v where v.campaign_id = p_campaign
      group by 1 order by 2 desc;
  elsif p_dimension = 'support' then
    -- Support is 0–5 (or unscored). Bucket label is the number, or 'Unscored'.
    return query
      select case when v.support is null then 'Unscored' else v.support::text end, count(*)::bigint
      from public.voters v where v.campaign_id = p_campaign
      group by 1 order by 1;
  else
    return;  -- unknown dimension → empty
  end if;
end;
$$;

revoke all on function public.campaign_voter_breakdown(uuid, text) from public;
grant execute on function public.campaign_voter_breakdown(uuid, text) to authenticated;

-- ── Parameterized COUNT for the count_voters tool ────────────────────────────
-- All args optional (NULL = no constraint). p_super_voter applies the N-of-M rule
-- using p_sv_min (default 3) over the M most-recent generals (default 4).
drop function if exists public.campaign_count_voters(uuid, text, text, text, text, smallint, boolean, smallint, smallint, text);

create or replace function public.campaign_count_voters(
  p_campaign     uuid,
  p_party        text     default null,
  p_race         text     default null,
  p_gender       text     default null,
  p_precinct     text     default null,
  p_min_support  smallint default null,
  p_super_voter  boolean  default null,
  p_sv_min       smallint default 3,
  p_sv_window    smallint default 4,
  p_flag         text     default null
)
returns bigint
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_count   bigint;
  v_codes   text[] := array['2024G','2022G','2020G','2018G'];  -- mirrors lib/elections.ts
  v_take    int := greatest(0, least(coalesce(p_sv_window, 4), 4));
  v_min     int := greatest(1, coalesce(p_sv_min, 3));
begin
  -- RLS-equivalent guard.
  if p_campaign is null or not (p_campaign in (select public.user_campaign_ids())) then
    return 0;
  end if;

  select count(*) into v_count
  from public.voters v
  where v.campaign_id = p_campaign
    and (p_party       is null or v.party    = p_party)
    and (p_race        is null or v.race     = p_race)
    and (p_gender      is null or v.gender   = p_gender)
    and (p_precinct    is null or v.precinct = p_precinct)
    and (p_min_support is null or v.support >= p_min_support)
    and (p_flag        is null or v.flags @> array[p_flag])
    and (
      p_super_voter is null
      or (
        -- count TRUE among the first v_take recent generals; compare to v_min.
        ( select count(*) from unnest(v_codes[1:v_take]) as code
          where (v.vote_history -> 'history' ->> code) = 'true' ) >= v_min
      ) = p_super_voter
    );

  return coalesce(v_count, 0);
end;
$$;

revoke all on function public.campaign_count_voters(uuid, text, text, text, text, smallint, boolean, smallint, smallint, text) from public;
grant execute on function public.campaign_count_voters(uuid, text, text, text, text, smallint, boolean, smallint, smallint, text) to authenticated;
