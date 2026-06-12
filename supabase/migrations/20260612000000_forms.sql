-- CANDI — Form Auto-Fill: templates, batches, voter-resolution RPC, storage bucket.
--
-- The killer use case: "I need 500 vote-by-mail request forms prefilled for a
-- neighborhood list." A form template is a PDF + a jsonb field mapping; a batch
-- is one generated, merged PDF (one filled page-set per voter) stored privately
-- in the `forms` bucket and re-downloadable via short-lived signed URLs.
--
-- • form_templates — campaign_id NULL = global built-in visible to every
--   campaign (the official FL DS-DE 160 ships in the repo at
--   public/forms/fl-vbm-request.pdf, so storage_path is NULL). Campaign-owned
--   templates (e.g. Harrison's own form, when it arrives) are a DATA-ONLY
--   addition: a new row whose mapping points at AcroForm field names or stamp
--   coordinates — no new code. Read-only to members; writes are service-role
--   only for now (no user write policies on purpose).
-- • form_batches — campaign-scoped output log. RLS mirrors canvasser_locations
--   (full CRUD for members of the campaign's org); inserts happen server-side.
-- • form_voters — precinct-filtered voter resolution for a batch. SECURITY
--   DEFINER but RLS-equivalent (user_campaign_ids guard), mirroring
--   precinct_stats, and it applies the SAME precinct-code normalization
--   (split suffixes "K002.1" → K002; the county's 2026 renumber crosswalk),
--   so the precinct dropdown counts (precinct_stats) and the voters a batch
--   resolves always agree. The service role is also allowed through the guard
--   (it bypasses RLS everywhere else anyway) so trusted server scripts can
--   exercise the same code path.
-- • storage: private `forms` bucket. Object paths are `<campaign_id>/...`.
--   NO storage.objects policies for end users — server code verifies
--   membership via getActiveCampaign() and only the service-role client
--   touches storage (upload + signed-URL creation).

-- ── Tables ────────────────────────────────────────────────────────────────────

create table if not exists public.form_templates (
  id           uuid primary key default gen_random_uuid(),
  campaign_id  uuid references public.campaigns(id) on delete cascade, -- NULL = global built-in
  name         text not null,
  storage_path text,            -- NULL = repo-bundled built-in (public/forms/…)
  mapping      jsonb not null,  -- { mode: "acroform"|"stamp", fields: [{ source, target }] }
  created_at   timestamptz not null default now()
);

create table if not exists public.form_batches (
  id           uuid primary key default gen_random_uuid(),
  campaign_id  uuid not null references public.campaigns(id) on delete cascade,
  template_id  uuid references public.form_templates(id) on delete set null,
  voter_count  int not null default 0,
  params       jsonb not null default '{}'::jsonb, -- the filter used (precinct / ids / limit)
  storage_path text,                               -- <campaign_id>/batches/<batch_id>.pdf
  status       text not null default 'done',
  created_at   timestamptz not null default now()
);

create index if not exists form_batches_campaign_idx
  on public.form_batches (campaign_id, created_at desc);

-- ── RLS ───────────────────────────────────────────────────────────────────────

alter table public.form_templates enable row level security;
alter table public.form_batches   enable row level security;

-- Templates: readable when global (campaign_id null) or owned by one of the
-- caller's campaigns. No insert/update/delete policies — service role only.
drop policy if exists form_templates_read on public.form_templates;
create policy form_templates_read on public.form_templates for select
  using (campaign_id is null or campaign_id in (select public.user_campaign_ids()));

-- Batches: mirror canvasser_locations — members of the campaign's org get full
-- CRUD (the app only ever inserts/reads server-side on the user's behalf).
drop policy if exists form_batches_all on public.form_batches;
create policy form_batches_all on public.form_batches for all
  using (campaign_id in (select public.user_campaign_ids()))
  with check (campaign_id in (select public.user_campaign_ids()));

-- ── Voter resolution RPC ──────────────────────────────────────────────────────

-- Voters in a (2026-normalized) precinct for a campaign, capped for one batch.
-- Returns only the columns the fill engine maps. Normalization mirrors
-- precinct_stats exactly so dropdown counts == batch counts.
create or replace function public.form_voters(p_campaign uuid, p_precinct text, p_limit int default 500)
returns table (
  id              uuid,
  first_name      text,
  last_name       text,
  address         text,
  city            text,
  state           text,
  zip             text,
  phone           text,
  email           text,
  mailing_address text,
  precinct        text
)
language sql
stable
security definer
set search_path = public
as $$
  -- Broward 2026 renumber crosswalk (same values as precinct_stats).
  with renames(old_code, new_code) as (
    values
      ('A016', 'A008'),
      ('D010', 'D009'),
      ('F009', 'F006'),
      ('K007', 'K006'),
      ('K008', 'K001'),
      ('M018', 'M010'),
      ('R043', 'R023'),
      ('R044', 'R035'),
      ('R045', 'R003'),
      ('R046', 'R021'),
      ('R047', 'R024'),
      ('T024', 'T005')
  ),
  base as (
    select
      v.id, v.first_name, v.last_name, v.address, v.city, v.state, v.zip,
      v.phone, v.email, v.mailing_address, v.precinct,
      upper(trim(split_part(v.precinct, '.', 1))) as norm0
    from public.voters v
    where v.campaign_id = p_campaign
      and v.precinct is not null
      -- RLS-equivalent guard: caller must be a member of this campaign's org.
      -- The service role (already RLS-exempt on the tables) also passes, so
      -- trusted server scripts can exercise the same path.
      and (
        p_campaign in (select public.user_campaign_ids())
        or (select auth.role()) = 'service_role'
      )
  )
  select
    b.id, b.first_name, b.last_name, b.address, b.city, b.state, b.zip,
    b.phone, b.email, b.mailing_address, b.precinct
  from base b
  left join renames r on r.old_code = b.norm0
  where coalesce(r.new_code, b.norm0) = upper(trim(p_precinct))
  order by b.last_name nulls last, b.first_name nulls last, b.id
  limit least(greatest(coalesce(p_limit, 500), 1), 500)
$$;

-- ── Storage: private `forms` bucket ───────────────────────────────────────────

-- Private bucket; object paths are `<campaign_id>/batches/<batch_id>.pdf`.
-- Deliberately NO storage.objects policies: end users never touch storage —
-- the server verifies campaign membership and uses the service-role client
-- for the upload + signed-URL creation only.
insert into storage.buckets (id, name, public)
values ('forms', 'forms', false)
on conflict (id) do nothing;

-- ── Seed: the official FL Vote-by-Mail request form (global built-in) ─────────

-- Official statewide form DS-DE 160 (eff. 2024-04-17), bundled in the repo at
-- public/forms/fl-vbm-request.pdf. Source:
-- https://dos.fl.gov/media/707937/ds-de-160-statewide-vote-by-mail-request-eng-fillable-eff-20240417.pdf
-- The PDF has 72 AcroForm fields; targets below are its exact field names.
-- DOB, FL DL / SSN, election choice, and signature are left for the voter.
insert into public.form_templates (campaign_id, name, storage_path, mapping)
select
  null,
  'FL Vote-by-Mail Request (official)',
  null,
  '{
    "mode": "acroform",
    "fields": [
      { "source": "full_name",      "target": "Voters Name" },
      { "source": "address",        "target": "Voters Home Address" },
      { "source": "city",           "target": "Voters Home Address City" },
      { "source": "state",          "target": "Voters Home Address State" },
      { "source": "zip",            "target": "Voters Home Address Zip code" },
      { "source": "mailing_street", "target": "Voters Mailing Address" },
      { "source": "mailing_city",   "target": "Voters Mailing Address City" },
      { "source": "mailing_state",  "target": "Voters Mailing Address State" },
      { "source": "mailing_zip",    "target": "Voters Mailing Address Zip code" },
      { "source": "phone",          "target": "Phone number" },
      { "source": "email",          "target": "Email address" }
    ]
  }'::jsonb
where not exists (
  select 1 from public.form_templates
  where campaign_id is null and name = 'FL Vote-by-Mail Request (official)'
);
