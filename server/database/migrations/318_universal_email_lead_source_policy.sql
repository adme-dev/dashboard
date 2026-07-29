-- Authoritative source policy after deployed 315/316 constraints lost unknown values.
-- Future placeholders are explicit, bounded identifiers; arbitrary strings remain invalid.

BEGIN;

ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_source_check;
ALTER TABLE leads ADD CONSTRAINT leads_source_check CHECK (
  source IN ('meta', 'google', 'manual', 'webhook', 'csv', 'email')
  OR source ~ '^future_[a-z][a-z0-9_]{0,23}$'
);

ALTER TABLE lead_form_rules DROP CONSTRAINT IF EXISTS lead_form_rules_source_check;
ALTER TABLE lead_form_rules ADD CONSTRAINT lead_form_rules_source_check CHECK (
  source IN ('meta', 'google', 'webhook', 'csv', 'email')
  OR source ~ '^future_[a-z][a-z0-9_]{0,23}$'
);

COMMIT;
