-- Dedicated, independently rotatable first-party website lead endpoints.
-- Existing Google and Meta endpoint rows and credentials are not modified.

BEGIN;

ALTER TABLE lead_webhook_endpoints
  DROP CONSTRAINT IF EXISTS lead_webhook_endpoints_source_check;

ALTER TABLE lead_webhook_endpoints
  ADD CONSTRAINT lead_webhook_endpoints_source_check
  CHECK (source IN ('google', 'meta_app', 'webhook'));

ALTER TABLE lead_webhook_endpoints
  ADD COLUMN IF NOT EXISTS provisioned_by TEXT,
  ADD COLUMN IF NOT EXISTS provision_reason TEXT
    CHECK (provision_reason IS NULL OR char_length(provision_reason) BETWEEN 1 AND 1000);

CREATE UNIQUE INDEX IF NOT EXISTS uq_lead_webhook_endpoints_client_webhook
  ON lead_webhook_endpoints (client_id, source)
  WHERE source = 'webhook';

COMMENT ON INDEX uq_lead_webhook_endpoints_client_webhook IS
  'One isolated first-party website lead credential per client; never shared with Google ingestion.';

COMMIT;
