-- ============================================================================
-- CANDI — Teammate invites (multi-tenancy onboarding, part 2).
-- ============================================================================
-- Completes the onboarding model from 20260613000000_tenant_isolation.sql:
-- organic signups keep getting a fresh personal org; org owners/directors can
-- now INVITE teammates by email into THEIR org with a chosen role.
--
--   1. public.invites — one row per invitation, created ONLY by verified org
--      admins through the server action (service role). One LIVE invite per
--      (org, email). Admin-only SELECT under RLS; no client writes at all.
--   2. handle_new_user() — on auth.users INSERT, pending invites matching the
--      new user's email are accepted: membership in each inviting org with the
--      invite's role, accepted_at stamped, and NO personal org. No pending
--      invite → personal org exactly as before.
--      ⚠ SECURITY: the invites TABLE is the sole authority. The trigger never
--      reads raw_user_meta_data for org access — anyone can self-signup with
--      forged metadata (e.g. a fake invite_org_id) and it must grant nothing.
--   3. accept_invite_for_existing_user() / revoke_invite() — service-role-only
--      helpers for the two flows the trigger can't cover: granting a membership
--      when the invitee already has an auth account (inviteUserByEmail refuses
--      existing emails), and withdrawing a consumed-but-never-used invite.
--
-- Idempotent (create-or-replace + drop-then-create policies). No existing rows
-- in orgs / memberships / campaigns / auth.users are touched.
-- ============================================================================


-- ─────────────────────────────────────────────────────────────────────────────
-- 1 — invites table
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.invites (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.orgs(id) on delete cascade,
  email       text not null,
  role        text not null check (role in ('director','canvasser','owner')),
  invited_by  uuid not null references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  accepted_at timestamptz,
  revoked_at  timestamptz
);

-- One LIVE (not yet accepted, not revoked) invite per email per org. Accepted /
-- revoked rows stay behind as history and don't block a re-invite.
create unique index if not exists invites_live_unique_idx
  on public.invites (org_id, lower(email))
  where accepted_at is null and revoked_at is null;

-- The signup trigger looks pending invites up by email alone.
create index if not exists invites_pending_email_idx
  on public.invites (lower(email))
  where accepted_at is null and revoked_at is null;

-- Org ids where the current user is owner/director — SECURITY DEFINER like the
-- existing user_org_ids()/user_campaign_ids() helpers (no RLS recursion).
create or replace function public.user_admin_org_ids()
returns setof uuid language sql stable security definer set search_path = public as $$
  select org_id from public.memberships
  where user_id = auth.uid() and role in ('owner','director')
$$;

alter table public.invites enable row level security;

-- Owners/directors can see their org's invites (team page). Canvassers see none.
drop policy if exists invites_select_admin on public.invites;
create policy invites_select_admin on public.invites for select
  using (org_id in (select public.user_admin_org_ids()));

-- No client writes, ever — all invite writes go through the server action
-- (service role, which bypasses RLS) or SECURITY DEFINER functions. Explicit
-- deny policies, mirroring the memberships_no_* style from tenant isolation.
drop policy if exists invites_no_insert on public.invites;
create policy invites_no_insert on public.invites
  for insert to authenticated, anon
  with check (false);

drop policy if exists invites_no_update on public.invites;
create policy invites_no_update on public.invites
  for update to authenticated, anon
  using (false) with check (false);

drop policy if exists invites_no_delete on public.invites;
create policy invites_no_delete on public.invites
  for delete to authenticated, anon
  using (false);


-- ─────────────────────────────────────────────────────────────────────────────
-- 2 — handle_new_user(): accept pending invites, else personal org as before
-- ─────────────────────────────────────────────────────────────────────────────
-- ⚠ SECURITY-CRITICAL. Org access is granted ONLY from public.invites rows,
-- which are written exclusively by verified org admins via the server action.
-- raw_user_meta_data is deliberately never consulted for membership: a
-- self-signup can carry arbitrary forged metadata and must get nothing beyond
-- its own personal org. If several orgs invited the same email, ALL pending
-- invites are accepted (one membership each) and no personal org is created.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  accepted   int := 0;
  new_org_id uuid := gen_random_uuid();
  display    text;
begin
  -- ── Invited signup? Accept every pending invite matching this email. ──
  if coalesce(new.email, '') <> '' then
    with pending as (
      select id, org_id, role
      from public.invites
      where lower(email) = lower(new.email)
        and accepted_at is null
        and revoked_at  is null
    ),
    granted as (
      -- Data-modifying CTEs run exactly once even when unreferenced.
      insert into public.memberships (org_id, user_id, role)
      select org_id, new.id, role from pending
      on conflict (org_id, user_id) do nothing
      returning org_id
    )
    update public.invites i
       set accepted_at = now()
      from pending p
     where i.id = p.id;
    get diagnostics accepted = row_count;
  end if;

  if accepted > 0 then
    return new;  -- invited: lands in the inviting org(s), no personal org
  end if;

  -- ── Organic signup: fresh personal org (unchanged from 20260613000000) ──
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

-- Re-assert the trigger wiring (idempotent, same as prior migrations).
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- ─────────────────────────────────────────────────────────────────────────────
-- 3 — service-role helpers for the two non-trigger paths
-- ─────────────────────────────────────────────────────────────────────────────
-- inviteUserByEmail() refuses emails that already have an auth account. For
-- those, the server action (after the SAME org-admin verification) grants the
-- membership immediately and consumes the invite. Looks the user up in
-- auth.users by email — only SQL can do that, hence SECURITY DEFINER. Callable
-- by service_role only; EXECUTE is revoked from end-user roles below.
create or replace function public.accept_invite_for_existing_user(p_invite_id uuid)
returns text
language plpgsql
security definer set search_path = public
as $$
declare
  inv record;
  uid uuid;
begin
  select * into inv
  from public.invites
  where id = p_invite_id and accepted_at is null and revoked_at is null;
  if not found then return 'invite-not-found'; end if;

  select id into uid
  from auth.users
  where lower(email) = lower(inv.email)
  order by created_at
  limit 1;
  if uid is null then return 'user-not-found'; end if;

  insert into public.memberships (org_id, user_id, role)
  values (inv.org_id, uid, inv.role)
  on conflict (org_id, user_id) do nothing;

  update public.invites set accepted_at = now() where id = inv.id;
  return 'ok';
end $$;

-- Revoke an invite. Because inviteUserByEmail() creates the auth user (and so
-- fires the trigger) at SEND time, a "pending-looking" invite may already have
-- granted a membership to someone who has never signed in. Revoking withdraws
-- that membership; if that leaves an invite-created, never-used account with no
-- memberships at all, the caller is told to delete it via the admin API (the
-- supported path for auth.users deletions) so the emailed link dies too.
-- A user who has actually signed in is a full member and is left untouched.
create or replace function public.revoke_invite(p_invite_id uuid)
returns text
language plpgsql
security definer set search_path = public
as $$
declare
  inv record;
  u   record;
  remaining int;
begin
  select * into inv from public.invites where id = p_invite_id;
  if not found then return 'not-found'; end if;
  if inv.revoked_at is not null then return 'ok'; end if;

  update public.invites set revoked_at = now() where id = inv.id;

  if inv.accepted_at is not null then
    select id, last_sign_in_at, invited_at into u
    from auth.users
    where lower(email) = lower(inv.email)
    order by created_at
    limit 1;
    if found and u.last_sign_in_at is null and u.invited_at is not null then
      delete from public.memberships
      where org_id = inv.org_id and user_id = u.id;
      select count(*) into remaining
      from public.memberships where user_id = u.id;
      if remaining = 0 then
        return 'delete-auth-user:' || u.id::text;
      end if;
    end if;
  end if;

  return 'ok';
end $$;

-- Service-role only: these helpers trust their caller (the server action has
-- already verified the caller is an owner/director of the invite's org).
revoke all on function public.accept_invite_for_existing_user(uuid) from public, anon, authenticated;
revoke all on function public.revoke_invite(uuid) from public, anon, authenticated;
grant execute on function public.accept_invite_for_existing_user(uuid) to service_role;
grant execute on function public.revoke_invite(uuid) to service_role;
