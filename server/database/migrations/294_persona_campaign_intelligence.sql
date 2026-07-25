-- Campaign-scoped Persona snapshots and governed audience activation requests.
-- Provider export is intentionally separate: approval makes a request export-ready,
-- but no migration, trigger, or endpoint performs an external provider write.

BEGIN;

CREATE TABLE IF NOT EXISTS crm_persona_metric_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  scope_hash TEXT NOT NULL CHECK (scope_hash ~ '^[a-f0-9]{64}$'),
  snapshot_date DATE NOT NULL DEFAULT CURRENT_DATE,
  filters JSONB NOT NULL DEFAULT '{}'::jsonb,
  payload JSONB NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (client_id, scope_hash, snapshot_date),
  CHECK (jsonb_typeof(filters) = 'object'),
  CHECK (jsonb_typeof(payload) = 'object'),
  CHECK (expires_at > generated_at)
);

CREATE INDEX IF NOT EXISTS idx_crm_persona_metric_snapshots_lookup
  ON crm_persona_metric_snapshots (client_id, scope_hash, generated_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_persona_metric_snapshots_expiry
  ON crm_persona_metric_snapshots (expires_at);

CREATE TABLE IF NOT EXISTS crm_persona_audience_activation_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('google_ads', 'meta')),
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 3 AND 120),
  filters JSONB NOT NULL DEFAULT '{}'::jsonb,
  estimated_size INTEGER NOT NULL CHECK (estimated_size >= 0),
  minimum_size INTEGER NOT NULL CHECK (minimum_size >= 100),
  status TEXT NOT NULL DEFAULT 'pending_privacy' CHECK (status IN (
    'blocked', 'pending_privacy', 'privacy_approved', 'approved',
    'rejected', 'cancelled', 'expired'
  )),
  blocked_reason TEXT CHECK (blocked_reason IS NULL OR char_length(blocked_reason) <= 1000),
  expires_at TIMESTAMPTZ NOT NULL,
  created_by UUID NOT NULL REFERENCES team_members(id) ON DELETE RESTRICT,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (jsonb_typeof(filters) = 'object'),
  CHECK (expires_at > created_at),
  CHECK (
    (estimated_size >= minimum_size AND blocked_reason IS NULL)
    OR (status = 'blocked' AND blocked_reason IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_crm_persona_activation_client
  ON crm_persona_audience_activation_requests (client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_persona_activation_pending
  ON crm_persona_audience_activation_requests (status, expires_at)
  WHERE status IN ('pending_privacy', 'privacy_approved', 'approved');

CREATE TABLE IF NOT EXISTS crm_persona_audience_activation_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  request_id UUID NOT NULL REFERENCES crm_persona_audience_activation_requests(id) ON DELETE CASCADE,
  approval_kind TEXT NOT NULL CHECK (approval_kind IN ('privacy', 'live')),
  approved_by UUID NOT NULL REFERENCES team_members(id) ON DELETE RESTRICT,
  reason TEXT NOT NULL CHECK (char_length(reason) BETWEEN 3 AND 1000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (request_id, approval_kind),
  UNIQUE (request_id, approved_by)
);

CREATE INDEX IF NOT EXISTS idx_crm_persona_activation_approvals_request
  ON crm_persona_audience_activation_approvals (client_id, request_id, created_at);

CREATE TABLE IF NOT EXISTS crm_persona_audience_activation_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  request_id UUID NOT NULL REFERENCES crm_persona_audience_activation_requests(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN (
    'created', 'blocked', 'privacy_approved', 'live_approved',
    'rejected', 'cancelled', 'expired'
  )),
  actor_id UUID NOT NULL REFERENCES team_members(id) ON DELETE RESTRICT,
  reason TEXT NOT NULL CHECK (char_length(reason) BETWEEN 3 AND 1000),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_crm_persona_activation_audit_request
  ON crm_persona_audience_activation_audit (client_id, request_id, created_at);

DROP TRIGGER IF EXISTS trg_crm_persona_activation_approvals_append_only
  ON crm_persona_audience_activation_approvals;
CREATE TRIGGER trg_crm_persona_activation_approvals_append_only
  BEFORE UPDATE OR DELETE ON crm_persona_audience_activation_approvals
  FOR EACH ROW EXECUTE FUNCTION prevent_measurement_append_only_mutation();

DROP TRIGGER IF EXISTS trg_crm_persona_activation_audit_append_only
  ON crm_persona_audience_activation_audit;
CREATE TRIGGER trg_crm_persona_activation_audit_append_only
  BEFORE UPDATE OR DELETE ON crm_persona_audience_activation_audit
  FOR EACH ROW EXECUTE FUNCTION prevent_measurement_append_only_mutation();

COMMIT;
