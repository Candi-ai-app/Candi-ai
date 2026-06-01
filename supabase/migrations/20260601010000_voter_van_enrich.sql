-- CANDI — VAN enrichment columns on voters.
--
-- Adds two nullable columns used to ENRICH (never replace) the existing
-- Supervisor-of-Elections (SoE) voter rows for the Harrison campaign (…030):
--   • vanid           — the VAN "Voter File VANID" (a campaign tool's own id),
--                       distinct from voters.external_id (the state SoE id).
--   • mailing_address — a composed one-line mailing address (mAddress, mCity,
--                       mState mZip5) from the VAN export, surfaced in the
--                       contact card only when it differs from the residence.
--
-- This migration ONLY adds the columns; it carries NO voter data. The actual
-- match + backfill (vanid always, mailing_address always, phone ONLY where the
-- existing SoE phone is null/empty) is a separate, data-free, set-based UPDATE
-- applied out-of-band via the Supabase CLI from the source xlsx, so no PII is
-- ever committed (see scripts/enrich-voter-van.mjs).
--
-- Party / race / precinct / age / email / support / persuasion / vote_history
-- are NOT touched by the enrichment.
--
-- Idempotent.

alter table public.voters
  add column if not exists vanid           text,
  add column if not exists mailing_address text;
