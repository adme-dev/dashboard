-- 116-lead-form-rule-source-expand.sql
-- Rules can be attached to generic webhooks and CSV imports as well as native
-- Meta/Google forms. Manual leads intentionally continue to bypass rules.

ALTER TABLE lead_form_rules DROP CONSTRAINT IF EXISTS lead_form_rules_source_check;
ALTER TABLE lead_form_rules ADD CONSTRAINT lead_form_rules_source_check
  CHECK (source IN ('meta', 'google', 'webhook', 'csv'));
