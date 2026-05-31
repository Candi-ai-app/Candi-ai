-- CANDI — fix onboarding voter surnames stuck on "Ali".
--
-- The new-campaign voter generator (app/select/actions.ts) picks a first AND last
-- name per row. An earlier build of that generator had a stuck last-name selection
-- so every onboarding voter came out surnamed "Ali" (first names still varied).
-- The generator itself is now correct (pick(LAST) advances the PRNG), but any
-- onboarding rows seeded while it was broken still read "Ali".
--
-- This migration deterministically re-assigns a varied surname to those rows:
--   surname = LAST[ hash(id) % len(LAST) ]
-- using a stable MD5 hash of the row id, so the result is reproducible and a
-- re-run maps each id to the same surname (idempotent — rows that are no longer
-- 'Ali' are not reprocessed).
--
-- SCOPE / SAFETY:
--   • Only touches generator-seeded rows (external_id like 'S-%') whose
--     last_name = 'Ali'. Hand-authored "hero" voters (e.g. the Reyes demo,
--     campaign 00000000-…-010) have real varied names and no 'S-%' ids, so they
--     are never touched.
--   • 'Ali' is excluded from the replacement list, so every affected row changes
--     to a different surname (no accidental no-op back to 'Ali').
--   • Display name is derived from first_name + last_name at read time, and the
--     external_id (S-<hash>-<n>) does NOT embed the name, so nothing else needs
--     rebuilding.

do $$
declare
  surnames text[] := array[
    'Nguyen','Carter','Flores','Brooks','Patel','Reed','Murphy','Cohen','Diaz','Walsh',
    'Okafor','Romano','Bauer','Singh','Hughes','Lozano','Foster','Khan','Berg',
    'Tucker','Mercer','Vance','Ortiz','Hale','Henderson','Whitfield','Raman','Bell','Park'
  ];
  n int := array_length(surnames, 1);
  updated int;
begin
  update public.voters v
     set last_name = surnames[
           1 + (('x' || substr(md5(v.id::text), 1, 8))::bit(32)::bigint % n)::int
         ],
         updated_at = now()
   where v.last_name = 'Ali'
     and v.external_id like 'S-%';

  get diagnostics updated = row_count;
  raise notice 'fix_voter_surnames: re-assigned % onboarding voter surnames', updated;
end $$;
