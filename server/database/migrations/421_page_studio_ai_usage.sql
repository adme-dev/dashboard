-- Private append-only charges. Settlement never releases a reservation.
-- Operation uniqueness deliberately excludes the month: old IDs cannot rerun.
BEGIN;
CREATE TABLE IF NOT EXISTS page_studio_ai_usage (
  tenant_id TEXT NOT NULL,
  client_id UUID NOT NULL,
  business_id UUID NOT NULL CHECK (business_id = client_id),
  site_id UUID NOT NULL,
  environment TEXT NOT NULL CHECK (environment IN ('staging', 'production')),
  operation_id TEXT NOT NULL CHECK (char_length(operation_id) BETWEEN 1 AND 512 AND operation_id ~ '^[A-Za-z0-9][A-Za-z0-9_:-]*$'),
  fingerprint TEXT NOT NULL CHECK (fingerprint ~ '^[a-f0-9]{64}$'),
  kind TEXT NOT NULL CHECK (kind IN ('model', 'action-test')),
  actor_id TEXT NOT NULL,
  actor_role TEXT NOT NULL CHECK (actor_role IN ('agency', 'client')),
  session_nonce TEXT NOT NULL,
  entitlement_id UUID NOT NULL,
  period_start DATE NOT NULL CHECK (EXTRACT(DAY FROM period_start) = 1),
  state TEXT NOT NULL DEFAULT 'reserved' CHECK (state IN ('reserved', 'succeeded', 'failed')),
  reserved_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  settled_at TIMESTAMPTZ,
  CHECK ((state = 'reserved') = (settled_at IS NULL)),
  PRIMARY KEY (tenant_id, client_id, environment, operation_id),
  FOREIGN KEY (tenant_id, client_id, site_id) REFERENCES page_studio_sites(tenant_id, client_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, client_id, entitlement_id) REFERENCES page_studio_entitlements(tenant_id, client_id, id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_page_studio_ai_usage_period ON page_studio_ai_usage(tenant_id, client_id, period_start);
COMMIT;
