-- Native retained intent for unpublished standalone previews. No provider call.
BEGIN;
CREATE TABLE IF NOT EXISTS page_studio_customer_provisioning_intents (
  site_id UUID PRIMARY KEY REFERENCES page_studio_customer_site_requests(site_id) ON DELETE RESTRICT,
  workspace_id UUID NOT NULL,
  business_id UUID NOT NULL,
  tenant_id TEXT NOT NULL,
  environment TEXT NOT NULL CHECK (environment = 'staging'),
  actor_identity_id UUID NOT NULL REFERENCES page_studio_customer_identities(id) ON DELETE RESTRICT,
  login_session_hash TEXT NOT NULL REFERENCES page_studio_customer_sessions(token_hash) ON DELETE RESTRICT,
  request_key TEXT NOT NULL UNIQUE,
  job JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (workspace_id, business_id) REFERENCES page_studio_business_owners(workspace_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, business_id, site_id) REFERENCES page_studio_sites(tenant_id, client_id, id) ON DELETE RESTRICT,
  CHECK ((jsonb_typeof(job) = 'object'
    AND job->'actor'->>'kind' = 'customer-user'
    AND job->'actor'->>'userId' = actor_identity_id::text
    AND job->'actor'->>'loginSessionHash' = login_session_hash
    AND job->'scope'->>'siteId' = site_id::text
    AND job->'scope'->>'businessId' = business_id::text
    AND job->'scope'->>'clientId' = business_id::text
    AND job->'scope'->>'tenantId' = tenant_id
    AND job->'scope'->>'environment' = environment
    AND job->>'requestKey' = request_key AND job->>'id' = request_key) IS TRUE)
);
DROP TRIGGER IF EXISTS page_studio_customer_provisioning_intent_immutable ON page_studio_customer_provisioning_intents;
CREATE TRIGGER page_studio_customer_provisioning_intent_immutable BEFORE UPDATE OR DELETE ON page_studio_customer_provisioning_intents
  FOR EACH ROW EXECUTE FUNCTION prevent_page_studio_immutable_mutation();
COMMIT;
