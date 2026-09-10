-- Standalone prerequisite for manual Page Studio access administration.
-- Compatible with the broader billing migration where it already exists.
BEGIN;

CREATE TABLE IF NOT EXISTS billing_entitlement_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  feature_key TEXT NOT NULL,
  action TEXT NOT NULL,
  previous_status TEXT,
  next_status TEXT,
  actor_id UUID,
  source TEXT NOT NULL DEFAULT 'database_trigger',
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_page_studio_access_audit_request
  ON billing_entitlement_audit (client_id, (metadata->>'tenantId'), (metadata->>'requestId'))
  WHERE feature_key = 'page_studio.access' AND source = 'page_studio_entitlements'
    AND action = 'grant_created';

CREATE OR REPLACE FUNCTION prevent_page_studio_access_audit_mutation()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Page Studio access audit records are append-only';
END;
$$;

DROP TRIGGER IF EXISTS trg_page_studio_access_audit_append_only ON billing_entitlement_audit;
CREATE TRIGGER trg_page_studio_access_audit_append_only
  BEFORE UPDATE OR DELETE ON billing_entitlement_audit
  FOR EACH ROW WHEN (OLD.feature_key = 'page_studio.access')
  EXECUTE FUNCTION prevent_page_studio_access_audit_mutation();

COMMIT;
