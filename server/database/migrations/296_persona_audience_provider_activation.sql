BEGIN;

CREATE TABLE IF NOT EXISTS crm_persona_audience_provider_settings (
  client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('google_ads', 'meta')),
  connection_id UUID REFERENCES social_connections(id) ON DELETE SET NULL,
  provider_audience_id TEXT,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  emergency_stop BOOLEAN NOT NULL DEFAULT FALSE,
  terms_accepted_at TIMESTAMPTZ,
  terms_accepted_by UUID REFERENCES team_members(id) ON DELETE SET NULL,
  validated_at TIMESTAMPTZ,
  last_synced_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (client_id, provider)
);

CREATE TABLE IF NOT EXISTS crm_persona_audience_exports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  request_id UUID NOT NULL REFERENCES crm_persona_audience_activation_requests(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('google_ads', 'meta')),
  operation TEXT NOT NULL CHECK (operation IN ('sync', 'remove')),
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'submitted', 'succeeded', 'partial', 'failed', 'skipped')),
  idempotency_key TEXT NOT NULL UNIQUE,
  provider_audience_id TEXT,
  provider_request_ids JSONB NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(provider_request_ids) = 'array'),
  attempted_additions INTEGER NOT NULL DEFAULT 0 CHECK (attempted_additions >= 0),
  attempted_removals INTEGER NOT NULL DEFAULT 0 CHECK (attempted_removals >= 0),
  successful_additions INTEGER NOT NULL DEFAULT 0 CHECK (successful_additions >= 0),
  successful_removals INTEGER NOT NULL DEFAULT 0 CHECK (successful_removals >= 0),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  error_code TEXT,
  error_message TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  queued_by UUID REFERENCES team_members(id) ON DELETE SET NULL,
  queued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  submitted_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_persona_audience_exports_request
  ON crm_persona_audience_exports (client_id, request_id, queued_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_persona_audience_exports_status
  ON crm_persona_audience_exports (status, updated_at)
  WHERE status IN ('queued', 'running', 'submitted', 'failed');

CREATE TABLE IF NOT EXISTS crm_persona_audience_export_members (
  export_id UUID NOT NULL REFERENCES crm_persona_audience_exports(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  request_id UUID NOT NULL REFERENCES crm_persona_audience_activation_requests(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL,
  operation TEXT NOT NULL CHECK (operation IN ('add', 'remove')),
  member_fingerprint CHAR(64) NOT NULL CHECK (member_fingerprint ~ '^[0-9a-f]{64}$'),
  email_hash CHAR(64) CHECK (email_hash IS NULL OR email_hash ~ '^[0-9a-f]{64}$'),
  phone_hash CHAR(64) CHECK (phone_hash IS NULL OR phone_hash ~ '^[0-9a-f]{64}$'),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'succeeded', 'failed')),
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (export_id, profile_id, operation),
  FOREIGN KEY (client_id, profile_id)
    REFERENCES crm_identity_profiles(client_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_crm_persona_audience_export_members_pending
  ON crm_persona_audience_export_members (export_id, status);

CREATE TABLE IF NOT EXISTS crm_persona_audience_member_state (
  client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  request_id UUID NOT NULL REFERENCES crm_persona_audience_activation_requests(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('google_ads', 'meta')),
  profile_id UUID NOT NULL,
  member_fingerprint CHAR(64) NOT NULL CHECK (member_fingerprint ~ '^[0-9a-f]{64}$'),
  email_hash CHAR(64) CHECK (email_hash IS NULL OR email_hash ~ '^[0-9a-f]{64}$'),
  phone_hash CHAR(64) CHECK (phone_hash IS NULL OR phone_hash ~ '^[0-9a-f]{64}$'),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  last_export_id UUID REFERENCES crm_persona_audience_exports(id) ON DELETE SET NULL,
  activated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  removed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (request_id, profile_id),
  FOREIGN KEY (client_id, profile_id)
    REFERENCES crm_identity_profiles(client_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_crm_persona_audience_member_state_active
  ON crm_persona_audience_member_state (client_id, provider, request_id)
  WHERE active = TRUE;

CREATE TABLE IF NOT EXISTS crm_persona_audience_provider_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  request_id UUID REFERENCES crm_persona_audience_activation_requests(id) ON DELETE SET NULL,
  export_id UUID REFERENCES crm_persona_audience_exports(id) ON DELETE SET NULL,
  provider TEXT NOT NULL CHECK (provider IN ('google_ads', 'meta')),
  action TEXT NOT NULL CHECK (
    action IN (
      'dispatch_queued',
      'dispatch_started',
      'provider_validated',
      'provider_submitted',
      'provider_succeeded',
      'provider_partial',
      'provider_failed',
      'removal_queued',
      'emergency_stopped'
    )
  ),
  actor_id UUID REFERENCES team_members(id) ON DELETE SET NULL,
  reason TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_persona_audience_provider_audit_request
  ON crm_persona_audience_provider_audit (client_id, request_id, created_at DESC);

DROP TRIGGER IF EXISTS trg_crm_persona_audience_provider_audit_append_only
  ON crm_persona_audience_provider_audit;
CREATE TRIGGER trg_crm_persona_audience_provider_audit_append_only
  BEFORE UPDATE OR DELETE ON crm_persona_audience_provider_audit
  FOR EACH ROW EXECUTE FUNCTION prevent_measurement_append_only_mutation();

COMMENT ON TABLE crm_persona_audience_member_state IS
  'Provider-ready SHA-256 identifiers retained only to reconcile membership and propagate consent withdrawals/removals. Raw PII is never stored here.';
COMMENT ON TABLE crm_persona_audience_provider_audit IS
  'Append-only provider activation evidence. Provider responses are reduced to status, counts and redacted error summaries.';

COMMIT;
