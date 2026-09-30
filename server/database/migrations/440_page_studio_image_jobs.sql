-- The queued job row is also its transactional outbox. Provider dispatch is
-- claimed once; a lease expiry never permits a second paid invocation.
BEGIN;
SET LOCAL lock_timeout = '5s';
CREATE TABLE IF NOT EXISTS page_studio_image_jobs (
  job_id UUID PRIMARY KEY,
  quote_id UUID NOT NULL UNIQUE REFERENCES page_studio_image_quotes(quote_id),
  tenant_id TEXT NOT NULL,
  client_id UUID NOT NULL,
  site_id UUID NOT NULL,
  environment TEXT NOT NULL CHECK(environment IN ('staging','production')),
  actor_role TEXT NOT NULL CHECK(actor_role IN ('agency','client')),
  actor_id TEXT NOT NULL,
  principal JSONB NOT NULL CHECK(jsonb_typeof(principal)='object' AND octet_length(principal::text)<=16000),
  state TEXT NOT NULL DEFAULT 'queued' CHECK(state IN ('queued','dispatched','reconciliation','succeeded','failed')),
  dispatch_token_hash TEXT CHECK(dispatch_token_hash ~ '^[a-f0-9]{64}$'),
  asset JSONB CHECK(asset IS NULL OR (jsonb_typeof(asset)='object' AND octet_length(asset::text)<=2000)),
  failure_code TEXT CHECK(failure_code IN ('provider-rejected','invalid-output','authority-revoked','dispatch-expired')),
  next_delivery_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  delivery_attempts INTEGER NOT NULL DEFAULT 0 CHECK(delivery_attempts>=0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  dispatched_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  UNIQUE(tenant_id,client_id,site_id,environment,job_id),
  FOREIGN KEY(tenant_id,client_id,site_id,environment,quote_id) REFERENCES page_studio_image_quotes(tenant_id,client_id,site_id,environment,quote_id),
  CHECK(job_id=quote_id),
  CHECK((state='succeeded')=(asset IS NOT NULL)),
  CHECK((state='failed')=(failure_code IS NOT NULL)),
  CHECK((state IN ('succeeded','failed'))=(finished_at IS NOT NULL)),
  CHECK((dispatch_token_hash IS NULL)=(dispatched_at IS NULL)),
  CHECK(state NOT IN ('dispatched','reconciliation','succeeded') OR dispatch_token_hash IS NOT NULL),
  CHECK(state<>'queued' OR dispatch_token_hash IS NULL)
);
CREATE INDEX IF NOT EXISTS page_studio_image_job_outbox ON page_studio_image_jobs(next_delivery_at,job_id) WHERE state='queued';
CREATE INDEX IF NOT EXISTS page_studio_image_job_library ON page_studio_image_jobs(tenant_id,client_id,site_id,environment,created_at DESC,job_id DESC);
CREATE TABLE IF NOT EXISTS page_studio_image_job_events (
  job_id UUID NOT NULL REFERENCES page_studio_image_jobs(job_id),
  state TEXT NOT NULL CHECK(state IN ('queued','dispatched','reconciliation','succeeded','failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(job_id,state)
);
DROP TRIGGER IF EXISTS page_studio_image_job_events_immutable ON page_studio_image_job_events;
CREATE TRIGGER page_studio_image_job_events_immutable BEFORE UPDATE OR DELETE ON page_studio_image_job_events
  FOR EACH ROW EXECUTE FUNCTION page_studio_image_credit_history_immutable();
COMMIT;
