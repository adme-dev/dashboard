-- 091-leads-source-expand.sql
-- Adds 'webhook' and 'csv' to the allowed leads.source values so the new
-- generic webhook endpoint and the CSV importer can insert without
-- silently failing the leads_source_check.

ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_source_check;
ALTER TABLE leads ADD CONSTRAINT leads_source_check
  CHECK (source IN ('meta', 'google', 'manual', 'webhook', 'csv'));
