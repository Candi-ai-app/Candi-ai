-- ============================================================================
-- CANDI — Tenant isolation hardening (security-critical, touches auth).
-- ============================================================================
-- Closes four cross-tenant gaps found in the isolation audit. All changes are
-- forward-looking: NO existing rows in orgs / memberships / campaigns / auth.users
-- are modified, so every current account keeps working. Idempotent
-- (CREATE OR REPLACE + drop-then-create policies).
--
--   P0-1  handle_new_user(): new signups land in a FRESH PERSONAL ORG instead of
--         auto-joining the shared demo org …0001 (which previously gave every new
--         account a path to other tenants' data via user_campaign_ids()).
--   P0-2  memberships: explicit deny of INSERT/UPDATE/DELETE for end users so a
--         client can no longer self-join an arbitrary org. (No app code writes
--         memberships via the RLS client — verified — so nothing legitimate breaks;
--         the SECURITY DEFINER signup trigger bypasses RLS and still works.)
--   P0-3  candidates storage bucket: scope INSERT/UPDATE writes to the uploader's
--         own campaigns (folder[1] = campaign id) instead of any authenticated user.
--         Public read is preserved (photos render in-app).
--   P1-6  list_turfs(): restore SECURITY DEFINER + search_path + a
--         user_campaign_ids() guard it had lost, without changing its return shape.
--
-- Sacred data (untouched): real org …0002 / real campaign …0030 (22,018 voters);
-- the @candi.app demo accounts in org …0001; Easton's eastonkh@gmail.com owner row.
-- ============================================================================


-- ─────────────────────────────────────────────────────────────────────────────
-- P0-1 — handle_new_user(): create a fresh personal org per signup
-- ─────────────────────────────────────────────────────────────────────────────
-- On a new auth.users insert, create a brand-new org named after the user and
-- make them its director. Does NOT touch the shared demo org …0001. Kept simple
-- and SECURITY DEFINER (bypasses RLS) so signup cannot fail on a policy; only two
-- inserts. The app seeds a demo campaign on first login — out of scope here; the
-- user just gets their own clean, empty org.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  new_org_id uuid := gen_random_uuid();
  display    text;
begin
  -- Workspace name: full_name if provided, else the email local-part, else a
  -- safe fallback. coalesce/nullif guard against null/empty metadata.
  display := coalesce(
    nullif(trim(new.raw_user_meta_data->>'full_name'), ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    'My'
  );

  insert into public.orgs (id, name)
  values (new_org_id, display || '''s workspace');

  insert into public.memberships (org_id, user_id, role)
  values (new_org_id, new.id, 'director');

  return new;
end $$;

-- Re-assert the trigger (no behavioral change to the wiring; safe to re-run).
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- ─────────────────────────────────────────────────────────────────────────────
-- P0-2 — lock down memberships writes
-- ─────────────────────────────────────────────────────────────────────────────
-- The existing memberships_select policy stays (defined in the init migration).
-- There is no INSERT/UPDATE/DELETE policy, so under RLS those are already denied
-- by default — but we add explicit, self-documenting deny policies so the intent
-- survives future edits and an accidental permissive policy elsewhere can't
-- silently re-open self-join. The signup trigger is SECURITY DEFINER and bypasses
-- RLS, so new-org enrollment is unaffected; migrations run as table owner and are
-- likewise unaffected.
drop policy if exists memberships_no_insert on public.memberships;
create policy memberships_no_insert on public.memberships
  for insert to authenticated, anon
  with check (false);

drop policy if exists memberships_no_update on public.memberships;
create policy memberships_no_update on public.memberships
  for update to authenticated, anon
  using (false) with check (false);

drop policy if exists memberships_no_delete on public.memberships;
create policy memberships_no_delete on public.memberships
  for delete to authenticated, anon
  using (false);


-- ─────────────────────────────────────────────────────────────────────────────
-- P0-3 — candidates storage bucket: scope writes to the uploader's campaigns
-- ─────────────────────────────────────────────────────────────────────────────
-- Upload path format (verified against storage.objects + the two upload sites in
-- components/select/*.tsx): "<campaignId>/<timestamp>.<ext>", so folder[1] is the
-- campaign id. EXCEPTION: the onboarding wizard uploads a photo BEFORE the campaign
-- row exists, using a throwaway prefix "new-<ts>-<rand>" (see campaign-onboarding.tsx);
-- those folders are not campaign ids and cannot reference another tenant.
--
-- Rule (helper keeps the policy readable AND makes the uuid cast safe — we only
-- cast strings that match the uuid shape, so a "new-…" prefix never raises
-- "invalid input syntax for type uuid"):
--   * uuid-shaped folder  -> must be in the uploader's user_campaign_ids()
--   * non-uuid folder     -> allowed (pre-create throwaway; not a tenant key)
create or replace function public.candidates_path_ok(object_name text)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select case
    when (storage.foldername(object_name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then ((storage.foldername(object_name))[1])::uuid in (select public.user_campaign_ids())
    else true
  end
$$;

drop policy if exists "candidates upload (authenticated)" on storage.objects;
create policy "candidates upload (authenticated)"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'candidates' and public.candidates_path_ok(name));

drop policy if exists "candidates update (authenticated)" on storage.objects;
create policy "candidates update (authenticated)"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'candidates' and public.candidates_path_ok(name))
  with check (bucket_id = 'candidates' and public.candidates_path_ok(name));

-- Public read policy is intentionally left as-is (photos are shown in-app);
-- only writes are tightened.


-- ─────────────────────────────────────────────────────────────────────────────
-- P1-6 — list_turfs(): restore the security-definer guard
-- ─────────────────────────────────────────────────────────────────────────────
-- Current live definition is plain `language sql stable` with NO guard, so a
-- caller could pass any campaign id. It is invoked through the RLS (authenticated)
-- client in canvassing/actions.ts → listTurfs(), so auth.uid() is set and the
-- user_campaign_ids() guard returns identical rows for a legitimate member while
-- denying foreign campaigns. Return shape is preserved EXACTLY (7 columns,
-- including the route jsonb added in 20260602000000_turf_route.sql); CREATE OR
-- REPLACE keeps the same signature.
create or replace function public.list_turfs(p_campaign uuid)
returns table (id uuid, name text, status text, voter_count int, door_count int, boundary jsonb, route jsonb)
language sql
stable
security definer set search_path = public
as $$
  select id, name, status, voter_count, door_count, st_asgeojson(boundary)::jsonb, route
  from public.turfs
  where campaign_id = p_campaign
    and boundary is not null
    and p_campaign in (select public.user_campaign_ids())
  order by created_at desc
$$;
