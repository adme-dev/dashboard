-- 289-crm-email-lead-source.sql
-- Add email-originated enquiries to the canonical Leads Engine allowlists.

BEGIN;

ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_source_check;
ALTER TABLE leads ADD CONSTRAINT leads_source_check
  CHECK (source IN ('meta', 'google', 'manual', 'webhook', 'csv', 'email'));

ALTER TABLE lead_form_rules
  DROP CONSTRAINT IF EXISTS lead_form_rules_source_check;
ALTER TABLE lead_form_rules ADD CONSTRAINT lead_form_rules_source_check
  CHECK (source IN ('meta', 'google', 'webhook', 'csv', 'email'));

COMMIT;
