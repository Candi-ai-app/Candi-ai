-- CANDI — voter congressional / state / house district columns.
--
-- Adds cd (congressional), sd (state senate), hd (state house) to voters so
-- the new VAN StandardText export (which includes CD/SD/HD) can be stored and
-- used for district-based targeting and reporting.
--
-- This migration ONLY adds the columns; it carries NO voter data. The actual
-- backfill runs out-of-band via scripts/enrich-van-districts.mjs from the
-- source xlsx so no PII is ever committed.
--
-- Idempotent.

alter table public.voters
  add column if not exists cd text,   -- congressional district (e.g. "20")
  add column if not exists sd text,   -- state senate district
  add column if not exists hd text;   -- state house district

create index if not exists voters_campaign_cd_idx on public.voters (campaign_id, cd);
