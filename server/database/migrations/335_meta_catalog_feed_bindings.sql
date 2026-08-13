-- 335: durable XeroFlow → Meta catalogue feed bindings and audit evidence.
-- Provider tokens remain in social_connections; these tables store identifiers
-- and sanitized provider readback only. Additive and idempotent.

BEGIN;

CREATE TABLE IF NOT EXISTS meta_oauth_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  state_digest CHAR(64) NOT NULL UNIQUE,
  initiated_by UUID NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
  intent TEXT NOT NULL CHECK (intent IN ('connection', 'catalog_management')),
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (state_digest ~ '^[0-9a-f]{64}$'),
  CHECK (expires_at > created_at)
);

CREATE INDEX IF NOT EXISTS idx_meta_oauth_attempts_pending
  ON meta_oauth_attempts (initiated_by, expires_at)
  WHERE consumed_at IS NULL;

CREATE TABLE IF NOT EXISTS meta_catalog_feed_bindings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE RESTRICT,
  connection_id UUID NOT NULL,
  source_provider TEXT NOT NULL DEFAULT 'social-dashboard'
    CHECK (source_provider = 'social-dashboard'),
  source_feed_id TEXT NOT NULL,
  source_feed_url TEXT NOT NULL,
  meta_business_id TEXT NOT NULL,
  product_catalog_id TEXT NOT NULL,
  product_feed_id TEXT NOT NULL,
  latest_upload_id TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('pending', 'ready', 'blocked')),
  schedule JSONB NOT NULL DEFAULT '{}'::jsonb,
  readback JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES team_members(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (client_id, connection_id, source_feed_id),
  FOREIGN KEY (client_id, connection_id)
    REFERENCES social_connections (client_id, id)
    ON UPDATE RESTRICT
    ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_meta_catalog_feed_bindings_catalog
  ON meta_catalog_feed_bindings (product_catalog_id, product_feed_id);
CREATE INDEX IF NOT EXISTS idx_meta_catalog_feed_bindings_client_state
  ON meta_catalog_feed_bindings (client_id, state);

CREATE TABLE IF NOT EXISTS meta_catalog_feed_audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  binding_id UUID NOT NULL REFERENCES meta_catalog_feed_bindings(id) ON DELETE RESTRICT,
  client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE RESTRICT,
  connection_id UUID NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('created', 'reused', 'updated', 'upload_requested', 'verified', 'blocked')),
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  actor_id UUID REFERENCES team_members(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (client_id, connection_id)
    REFERENCES social_connections (client_id, id)
    ON UPDATE RESTRICT
    ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_meta_catalog_feed_audit_binding_created
  ON meta_catalog_feed_audit_events (binding_id, created_at DESC);

CREATE OR REPLACE FUNCTION reject_meta_catalog_feed_audit_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Meta catalogue feed audit is append-only; insert a correcting event instead';
END;
$$;

DROP TRIGGER IF EXISTS meta_catalog_feed_audit_append_only ON meta_catalog_feed_audit_events;
CREATE TRIGGER meta_catalog_feed_audit_append_only
  BEFORE UPDATE OR DELETE ON meta_catalog_feed_audit_events
  FOR EACH ROW EXECUTE FUNCTION reject_meta_catalog_feed_audit_mutation();

COMMIT;
