-- CANDI — add a public email column to voters.
--
-- Adds `voters.email` for surfacing a constituent email in the contact card and
-- (future) email outreach. Sourced from the FL Supervisor-of-Elections export's
-- `Public_Email_Address` column at import time (see scripts/import-voter-file.mjs).
--
-- This migration only adds the column; it carries NO voter data. The Harrison
-- (…030) backfill is a separate, data-free set-based UPDATE applied out-of-band
-- via the Supabase CLI from the source xlsx so no PII is ever committed.
--
-- Idempotent.

alter table public.voters add column if not exists email text;
