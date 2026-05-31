-- Campaign area: store the human-readable State / County the campaign covers.
-- These pair with the existing `district` column to scope the sample voter set
-- created during onboarding (see app/select/new + app/select/actions.ts).
-- Idempotent so it is safe to re-run.

alter table public.campaigns add column if not exists state text;
alter table public.campaigns add column if not exists county text;
