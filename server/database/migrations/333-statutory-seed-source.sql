-- 333: allow statutory-seed as a cashflow_commitments source.
-- Seeded payroll/statutory obligations (wages, super, SRO, ATO instalment)
-- are ordinary commitments distinguished only by source, so the seeder can
-- find its own rows and the UI can badge them.
ALTER TABLE cashflow_commitments
  DROP CONSTRAINT IF EXISTS cashflow_commitments_source_check;
ALTER TABLE cashflow_commitments
  ADD CONSTRAINT cashflow_commitments_source_check
  CHECK (source IN ('manual','spreadsheet-import','statutory-seed'));
