-- 123-lead-rule-test-fired.sql
-- Persist when a lead form rule was last test-fired, so the Leads rule editor can
-- show a durable "Verify" checkmark across reloads and for the whole team
-- (replaces relying on session-only state). Additive + idempotent.

ALTER TABLE lead_form_rules
  ADD COLUMN IF NOT EXISTS last_test_fired_at TIMESTAMPTZ;
