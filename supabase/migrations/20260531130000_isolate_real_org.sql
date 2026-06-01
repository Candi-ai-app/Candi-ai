-- Isolate Easton Harrison's REAL campaign (…030, 18,925 real voters) into its own
-- org so OPEN signups can no longer reach real voter PII.
--
-- Background: handle_new_user() (see 20260531000001_auth.sql) auto-enrolls EVERY
-- new auth user as a director in the demo org …0001. The real campaign currently
-- lives in …0001 too, so any new account could read its voters via the RLS-scoped
-- user_campaign_ids(). RLS itself is correct — the fix is to move the real data
-- out of the open org into a dedicated one (…0002) and re-grant only the known
-- test accounts (+ the project owner if present) so testing continues.
--
-- After this runs: new signups remain directors of …0001 only (now demo-only),
-- and their user_campaign_ids() will NOT include …030.
-- Idempotent.

-- 1. Dedicated org for the real campaign.
insert into public.orgs (id, name)
values ('00000000-0000-0000-0000-000000000002', 'Harrison for Broward')
on conflict (id) do nothing;

-- 2. Move the real campaign out of the open demo org (…0001) into …0002.
update public.campaigns
   set org_id = '00000000-0000-0000-0000-000000000002'
 where id = '00000000-0000-0000-0000-000000000030';

-- 3. Re-grant access to the moved org for the known accounts (lookup by email),
--    so they keep their access to the real campaign after the move.
insert into public.memberships (org_id, user_id, role)
select '00000000-0000-0000-0000-000000000002', id, 'owner'
  from auth.users where email = 'owner@candi.app'
on conflict (org_id, user_id) do nothing;

insert into public.memberships (org_id, user_id, role)
select '00000000-0000-0000-0000-000000000002', id, 'director'
  from auth.users where email = 'director@candi.app'
on conflict (org_id, user_id) do nothing;

insert into public.memberships (org_id, user_id, role)
select '00000000-0000-0000-0000-000000000002', id, 'canvasser'
  from auth.users where email = 'canvasser@candi.app'
on conflict (org_id, user_id) do nothing;

-- Project owner's real account, if it exists (either spelling). No-op otherwise.
insert into public.memberships (org_id, user_id, role)
select '00000000-0000-0000-0000-000000000002', id, 'owner'
  from auth.users where email in ('taylormcghee93@gmail.com', 'taylormcghee@gmail.com')
on conflict (org_id, user_id) do nothing;
