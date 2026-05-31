-- Seed a 2nd demo campaign so the campaign picker shows ≥2 choices.
-- Both campaigns live in the demo org (…001) so the seeded demo users
-- (owner/director/canvasser@candi.app, all enrolled in …001) can see them.
-- Idempotent.

-- Ensure the demo org exists (no-op if the base seed already ran).
insert into public.orgs (id, name)
values ('00000000-0000-0000-0000-000000000001', 'Reyes for State Senate')
on conflict (id) do nothing;

-- Defensive: make sure the original Reyes campaign (…010) is in the demo org
-- so demo users can access it. No-op if it already is.
update public.campaigns
   set org_id = '00000000-0000-0000-0000-000000000001'
 where id = '00000000-0000-0000-0000-000000000010'
   and org_id is distinct from '00000000-0000-0000-0000-000000000001';

-- 2nd campaign: Daniel Okafor for County Commission (Broward D-9).
insert into public.campaigns (id, org_id, candidate, office, district, election_date)
values (
  '00000000-0000-0000-0000-000000000020',
  '00000000-0000-0000-0000-000000000001',
  'Daniel Okafor',
  'County Commission',
  'Broward D-9',
  '2026-11-03'
)
on conflict (id) do nothing;
