-- CANDI — live canvasser locations (real-time field tracking).
--
-- One row per canvasser (membership), upserted by the GPS field app every ~15s
-- while they walk a turf. The owner's Canvassers tab reads these to show each
-- canvasser's live position, last-seen time, and status on a map.
--
-- RLS mirrors turfs/contacts: any member of the campaign's org can read + write
-- rows for that campaign (the field app only ever upserts the signed-in user's
-- own membership row).

create table if not exists public.canvasser_locations (
  membership_id uuid primary key references public.memberships(id) on delete cascade,
  campaign_id   uuid not null references public.campaigns(id) on delete cascade,
  lng           double precision not null,
  lat           double precision not null,
  accuracy      double precision,
  status        text not null default 'active',
  updated_at    timestamptz not null default now()
);

create index if not exists canvasser_locations_campaign_idx
  on public.canvasser_locations (campaign_id);

alter table public.canvasser_locations enable row level security;

drop policy if exists canvasser_locations_all on public.canvasser_locations;
create policy canvasser_locations_all on public.canvasser_locations for all
  using (campaign_id in (select public.user_campaign_ids()))
  with check (campaign_id in (select public.user_campaign_ids()));
