-- Dedicated Podium webhook credentials. These are server-to-server HMAC
-- secrets and must never be shared with the browser website endpoint.

BEGIN;

ALTER TABLE lead_webhook_endpoints
  DROP CONSTRAINT IF EXISTS lead_webhook_endpoints_source_check;

ALTER TABLE lead_webhook_endpoints
  ADD CONSTRAINT lead_webhook_endpoints_source_check
  CHECK (source IN ('google', 'meta_app', 'webhook', 'podium'));

CREATE UNIQUE INDEX IF NOT EXISTS uq_lead_webhook_endpoints_client_podium
  ON lead_webhook_endpoints (client_id, source)
  WHERE source = 'podium';

COMMENT ON INDEX uq_lead_webhook_endpoints_client_podium IS
  'One isolated server-side Podium HMAC credential per client.';

COMMIT;
