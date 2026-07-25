BEGIN;

CREATE TABLE IF NOT EXISTS crm_communication_provider_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('twilio', 'telnyx')),
  display_name TEXT NOT NULL CHECK (char_length(display_name) BETWEEN 2 AND 120),
  credential_ref TEXT NOT NULL CHECK (char_length(credential_ref) BETWEEN 8 AND 255),
  channels TEXT[] NOT NULL DEFAULT '{}'::text[]
    CHECK (channels <@ ARRAY['sms', 'voice', 'email']::text[]),
  status TEXT NOT NULL DEFAULT 'disconnected'
    CHECK (status IN ('disconnected', 'validating', 'active', 'degraded', 'error', 'suspended')),
  emergency_stop BOOLEAN NOT NULL DEFAULT TRUE,
  last_validated_at TIMESTAMPTZ,
  last_error_class TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (client_id, id)
);

CREATE TABLE IF NOT EXISTS crm_communication_routes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  location_key TEXT NOT NULL DEFAULT 'primary'
    CHECK (char_length(location_key) BETWEEN 1 AND 120),
  channel TEXT NOT NULL CHECK (channel IN ('sms', 'voice', 'email')),
  provider_account_id UUID,
  external_address_ref TEXT,
  inbound_mode TEXT NOT NULL DEFAULT 'human'
    CHECK (inbound_mode IN ('human', 'voicemail', 'receptionist')),
  outbound_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'validating', 'active', 'paused', 'error')),
  emergency_stop BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (client_id, provider_account_id)
    REFERENCES crm_communication_provider_accounts(client_id, id) ON DELETE RESTRICT,
  UNIQUE (client_id, id),
  UNIQUE (client_id, location_key, channel)
);

CREATE TABLE IF NOT EXISTS crm_receptionist_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  location_key TEXT NOT NULL DEFAULT 'primary'
    CHECK (char_length(location_key) BETWEEN 1 AND 120),
  status TEXT NOT NULL DEFAULT 'disabled'
    CHECK (status IN ('disabled', 'configuring', 'evaluation', 'pilot', 'live', 'suspended')),
  industry_template_key TEXT,
  industry_template_version TEXT,
  knowledge_release_ref TEXT,
  evaluation_status TEXT NOT NULL DEFAULT 'not_started'
    CHECK (evaluation_status IN ('not_started', 'running', 'failed', 'passed', 'expired')),
  voice_route_id UUID,
  business_hours JSONB NOT NULL DEFAULT '{}'::jsonb,
  handoff_policy JSONB NOT NULL DEFAULT '{}'::jsonb,
  recording_policy TEXT NOT NULL DEFAULT 'disabled'
    CHECK (recording_policy IN ('disabled', 'consent_required', 'enabled')),
  max_monthly_spend_minor BIGINT NOT NULL DEFAULT 0 CHECK (max_monthly_spend_minor >= 0),
  emergency_stop BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (client_id, voice_route_id)
    REFERENCES crm_communication_routes(client_id, id) ON DELETE RESTRICT,
  UNIQUE (client_id, id),
  UNIQUE (client_id, location_key)
);

CREATE TABLE IF NOT EXISTS crm_receptionist_policy_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  profile_id UUID,
  session_ref TEXT,
  decision TEXT NOT NULL CHECK (decision IN ('allow', 'allow_with_confirmation', 'handoff', 'deny')),
  policy_key TEXT NOT NULL,
  reason_code TEXT NOT NULL,
  actor_type TEXT NOT NULL CHECK (actor_type IN ('system', 'client_user', 'agency_user', 'assistant')),
  actor_id UUID,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  FOREIGN KEY (client_id, profile_id)
    REFERENCES crm_receptionist_profiles(client_id, id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_receptionist_policy_events_client
  ON crm_receptionist_policy_events (client_id, occurred_at DESC);

CREATE TABLE IF NOT EXISTS crm_receptionist_handoffs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  profile_id UUID,
  session_ref TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'requested'
    CHECK (status IN ('requested', 'acknowledged', 'resolved', 'expired')),
  priority TEXT NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('normal', 'high', 'urgent', 'emergency')),
  assigned_to UUID,
  reason_code TEXT NOT NULL,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  acknowledged_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  resolution_code TEXT,
  FOREIGN KEY (client_id, profile_id)
    REFERENCES crm_receptionist_profiles(client_id, id) ON DELETE RESTRICT,
  UNIQUE (client_id, session_ref, reason_code)
);

CREATE INDEX IF NOT EXISTS idx_receptionist_handoffs_open
  ON crm_receptionist_handoffs (client_id, priority, requested_at)
  WHERE status IN ('requested', 'acknowledged');

CREATE TABLE IF NOT EXISTS crm_external_mcp_clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 2 AND 120),
  status TEXT NOT NULL DEFAULT 'disabled'
    CHECK (status IN ('disabled', 'active', 'suspended', 'revoked')),
  token_hash TEXT NOT NULL CHECK (char_length(token_hash) BETWEEN 32 AND 255),
  scopes TEXT[] NOT NULL DEFAULT '{}'::text[] CHECK (cardinality(scopes) <= 50),
  approval_mode TEXT NOT NULL DEFAULT 'read_only'
    CHECK (approval_mode IN ('read_only', 'propose_confirm')),
  expires_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ,
  UNIQUE (client_id, id),
  UNIQUE (client_id, token_hash)
);

CREATE TABLE IF NOT EXISTS crm_external_mcp_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  mcp_client_id UUID,
  tool_name TEXT NOT NULL,
  action TEXT NOT NULL,
  decision TEXT NOT NULL CHECK (decision IN ('allowed', 'denied', 'confirmation_required')),
  reason_code TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  duration_ms INTEGER CHECK (duration_ms IS NULL OR duration_ms >= 0),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  FOREIGN KEY (client_id, mcp_client_id)
    REFERENCES crm_external_mcp_clients(client_id, id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_external_mcp_audit_client
  ON crm_external_mcp_audit (client_id, occurred_at DESC);

DROP TRIGGER IF EXISTS trg_receptionist_policy_events_append_only
  ON crm_receptionist_policy_events;
CREATE TRIGGER trg_receptionist_policy_events_append_only
  BEFORE UPDATE OR DELETE ON crm_receptionist_policy_events
  FOR EACH ROW EXECUTE FUNCTION prevent_measurement_append_only_mutation();

DROP TRIGGER IF EXISTS trg_external_mcp_audit_append_only
  ON crm_external_mcp_audit;
CREATE TRIGGER trg_external_mcp_audit_append_only
  BEFORE UPDATE OR DELETE ON crm_external_mcp_audit
  FOR EACH ROW EXECUTE FUNCTION prevent_measurement_append_only_mutation();

COMMENT ON COLUMN crm_communication_provider_accounts.credential_ref IS
  'Reference to encrypted secret storage. Provider credentials must never be stored in this table.';
COMMENT ON COLUMN crm_external_mcp_clients.token_hash IS
  'One-way token hash only. Raw external MCP credentials are never persisted.';

COMMIT;
