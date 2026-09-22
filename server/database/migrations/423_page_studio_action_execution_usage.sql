-- Add a distinct production action-run charge. Preserve all earlier receipts,
-- the one-unit monthly allowance, and immutable cross-month operation identity.
BEGIN;
ALTER TABLE page_studio_ai_usage DROP CONSTRAINT IF EXISTS page_studio_ai_usage_kind_check;
ALTER TABLE page_studio_ai_usage ADD CONSTRAINT page_studio_ai_usage_kind_check
  CHECK (kind IN ('model', 'action-test', 'action-execution'));
COMMIT;
