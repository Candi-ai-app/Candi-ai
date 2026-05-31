-- CANDI — multi-tenant schema: orgs / campaigns / memberships / voters / turfs / contacts
-- PostGIS for turf geometry + voter points. RLS scopes every row to the user's campaigns.

create extension if not exists postgis;

-- ── Tenancy ──────────────────────────────────────────────────────────────────
create table if not exists public.orgs (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.campaigns (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.orgs(id) on delete cascade,
  candidate     text not null,
  office        text,
  district      text,
  election_date date,
  created_at    timestamptz not null default now()
);

-- roles: owner | director | canvasser
create table if not exists public.memberships (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.orgs(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  role       text not null default 'canvasser' check (role in ('owner','director','canvasser')),
  created_at timestamptz not null default now(),
  unique (org_id, user_id)
);

-- ── Voters ───────────────────────────────────────────────────────────────────
create table if not exists public.voters (
  id           uuid primary key default gen_random_uuid(),
  campaign_id  uuid not null references public.campaigns(id) on delete cascade,
  external_id  text,                          -- state voter id (Supervisor of Elections)
  first_name   text,
  last_name    text,
  age          int,
  party        text check (party is null or party in ('D','R','I')),
  precinct     text,
  address      text,
  city         text,
  state        text,
  zip          text,
  phone        text,
  support      smallint check (support between 0 and 5),
  persuasion   smallint check (persuasion between 0 and 5),
  vote_history jsonb not null default '{}'::jsonb,
  flags        text[] not null default '{}',
  geom         geometry(Point, 4326),         -- Census-geocoded lat/lng
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (campaign_id, external_id)
);
create index if not exists voters_campaign_idx           on public.voters (campaign_id);
create index if not exists voters_campaign_party_idx     on public.voters (campaign_id, party);
create index if not exists voters_campaign_precinct_idx  on public.voters (campaign_id, precinct);
create index if not exists voters_campaign_name_idx      on public.voters (campaign_id, last_name, first_name);
create index if not exists voters_geom_idx               on public.voters using gist (geom);

-- ── Turfs ────────────────────────────────────────────────────────────────────
create table if not exists public.turfs (
  id          uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  name        text not null,
  status      text not null default 'queued' check (status in ('queued','active','complete')),
  assignee_id uuid references public.memberships(id) on delete set null,
  boundary    geometry(Polygon, 4326),        -- drawn turf polygon (Mapbox GL Draw)
  door_count  int not null default 0,
  voter_count int not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists turfs_campaign_idx  on public.turfs (campaign_id);
create index if not exists turfs_boundary_idx  on public.turfs using gist (boundary);

-- ── Contacts (canvass / text / call interactions) ────────────────────────────
create table if not exists public.contacts (
  id           uuid primary key default gen_random_uuid(),
  campaign_id  uuid not null references public.campaigns(id) on delete cascade,
  voter_id     uuid references public.voters(id) on delete cascade,
  canvasser_id uuid references public.memberships(id) on delete set null,
  channel      text check (channel in ('door','text','call','mail')),
  result       text,
  support      smallint check (support between 0 and 5),
  notes        text,
  created_at   timestamptz not null default now()
);
create index if not exists contacts_voter_idx    on public.contacts (voter_id);
create index if not exists contacts_campaign_idx on public.contacts (campaign_id);

-- ── Access helpers (SECURITY DEFINER → no RLS recursion) ─────────────────────
create or replace function public.user_org_ids()
returns setof uuid language sql stable security definer set search_path = public as $$
  select org_id from public.memberships where user_id = auth.uid()
$$;

create or replace function public.user_campaign_ids()
returns setof uuid language sql stable security definer set search_path = public as $$
  select c.id from public.campaigns c
  join public.memberships m on m.org_id = c.org_id
  where m.user_id = auth.uid()
$$;

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table public.orgs        enable row level security;
alter table public.campaigns   enable row level security;
alter table public.memberships enable row level security;
alter table public.voters      enable row level security;
alter table public.turfs       enable row level security;
alter table public.contacts    enable row level security;

drop policy if exists orgs_select on public.orgs;
create policy orgs_select on public.orgs for select
  using (id in (select public.user_org_ids()));

drop policy if exists memberships_select on public.memberships;
create policy memberships_select on public.memberships for select
  using (org_id in (select public.user_org_ids()));

drop policy if exists campaigns_all on public.campaigns;
create policy campaigns_all on public.campaigns for all
  using (org_id in (select public.user_org_ids()))
  with check (org_id in (select public.user_org_ids()));

drop policy if exists voters_all on public.voters;
create policy voters_all on public.voters for all
  using (campaign_id in (select public.user_campaign_ids()))
  with check (campaign_id in (select public.user_campaign_ids()));

drop policy if exists turfs_all on public.turfs;
create policy turfs_all on public.turfs for all
  using (campaign_id in (select public.user_campaign_ids()))
  with check (campaign_id in (select public.user_campaign_ids()));

drop policy if exists contacts_all on public.contacts;
create policy contacts_all on public.contacts for all
  using (campaign_id in (select public.user_campaign_ids()))
  with check (campaign_id in (select public.user_campaign_ids()));
