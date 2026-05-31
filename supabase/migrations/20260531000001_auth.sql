-- Auto-enroll every new auth user into the demo org as a director.
-- (Demo convenience — real onboarding will assign orgs/roles explicitly.)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.memberships (org_id, user_id, role)
  values ('00000000-0000-0000-0000-000000000001', new.id, 'director')
  on conflict (org_id, user_id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
