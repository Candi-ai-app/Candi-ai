-- tag_voters — bulk-append a single tag to voters.flags for a set of external_ids,
-- scoped to one campaign. Powers the Voters toolbar bulk actions ("Add to text
-- queue" → 'text-queue', "Add to call list" → 'call-list').
--
-- Set-based: one UPDATE touches every matching row (no per-voter round-trips), so
-- it scales to large files (e.g. Easton's ~18.9k). Idempotent — only rows that do
-- NOT already carry the tag are updated, and the appended array stays distinct.
--
-- SECURITY DEFINER so it can write regardless of the caller's direct table grants,
-- but it RE-CHECKS that the campaign is one the caller belongs to (user_campaign_ids),
-- keeping it RLS-safe. Returns the count of voters newly tagged.

create or replace function public.tag_voters(
  p_campaign uuid,
  p_external_ids text[],
  p_tag text
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  -- Authorization: caller must be a member of the campaign (mirrors RLS).
  if p_campaign is null or not (p_campaign in (select public.user_campaign_ids())) then
    return 0;
  end if;
  if p_tag is null or btrim(p_tag) = '' or p_external_ids is null then
    return 0;
  end if;

  update public.voters v
     set flags = array_append(v.flags, btrim(p_tag)),
         updated_at = now()
   where v.campaign_id = p_campaign
     and v.external_id = any(p_external_ids)
     and not (btrim(p_tag) = any(v.flags));   -- idempotent: skip rows already tagged

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.tag_voters(uuid, text[], text) from public;
grant execute on function public.tag_voters(uuid, text[], text) to authenticated;
