-- 362_google_pmax_launch_foundation.sql
-- Durable, version-bound launch plans with immutable approval and event evidence.

BEGIN;

CREATE OR REPLACE FUNCTION campaign_launch_payload_has_sensitive_keys(input JSONB)
RETURNS BOOLEAN AS $$
DECLARE
  entry_key TEXT;
  entry_value JSONB;
  normalized_key TEXT;
BEGIN
  IF jsonb_typeof(input) = 'object' THEN
    FOR entry_key, entry_value IN SELECT key, value FROM jsonb_each(input)
    LOOP
      normalized_key := regexp_replace(lower(entry_key), '[^a-z0-9]', '', 'g');
      IF normalized_key ~ '(token|authorization|password|secret|credential|apikey|privatekey|cookie|bearer)' THEN
        RETURN TRUE;
      END IF;
      IF campaign_launch_payload_has_sensitive_keys(entry_value) THEN RETURN TRUE; END IF;
    END LOOP;
  ELSIF jsonb_typeof(input) = 'array' THEN
    FOR entry_value IN SELECT value FROM jsonb_array_elements(input)
    LOOP
      IF campaign_launch_payload_has_sensitive_keys(entry_value) THEN RETURN TRUE; END IF;
    END LOOP;
  END IF;
  RETURN FALSE;
END;
$$ LANGUAGE plpgsql
   IMMUTABLE
   SECURITY INVOKER
   SET search_path = public, pg_temp;

CREATE TABLE IF NOT EXISTS campaign_launches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  brief_id UUID NOT NULL REFERENCES briefs(id) ON DELETE RESTRICT,
  client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE RESTRICT,
  connection_id UUID NOT NULL REFERENCES social_connections(id) ON DELETE RESTRICT,
  platform TEXT NOT NULL DEFAULT 'google_ads' CHECK (platform = 'google_ads'),
  campaign_type TEXT NOT NULL DEFAULT 'G_PMaxInventory' CHECK (
    campaign_type = 'G_PMaxInventory'
  ),
  config_version INTEGER NOT NULL CHECK (config_version > 0),
  config_hash TEXT NOT NULL CHECK (
    char_length(config_hash) = 64
    AND config_hash ~ '^[a-f0-9]{64}$'
  ),
  idempotency_key TEXT NOT NULL CHECK (
    char_length(idempotency_key) = 64
    AND idempotency_key ~ '^[a-f0-9]{64}$'
  ),
  normalized_config JSONB NOT NULL CHECK (
    jsonb_typeof(normalized_config) = 'object'
    AND octet_length(normalized_config::text) <= 262144
  ),
  state TEXT NOT NULL DEFAULT 'DRAFT' CHECK (state IN (
    'DRAFT',
    'PREFLIGHT_FAILED',
    'READY_FOR_APPROVAL',
    'APPROVED',
    'EXECUTING',
    'CREATED_PAUSED',
    'VERIFICATION_FAILED',
    'VERIFIED_PAUSED',
    'ACTIVATION_APPROVED',
    'ENABLING',
    'ENABLED_VERIFIED',
    'FAILED_RETRYABLE',
    'RECOVERY_REQUIRED',
    'CANCELLED'
  )),
  preflight_result JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (
    jsonb_typeof(preflight_result) = 'object'
    AND octet_length(preflight_result::text) <= 262144
  ),
  provider_resources JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (
    jsonb_typeof(provider_resources) = 'object'
    AND octet_length(provider_resources::text) <= 262144
  ),
  verification_result JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (
    jsonb_typeof(verification_result) = 'object'
    AND octet_length(verification_result::text) <= 262144
  ),
  retry_from_state TEXT CHECK (retry_from_state IN ('EXECUTING', 'ENABLING')),
  media_spend_id UUID REFERENCES media_spend(id) ON DELETE SET NULL,
  last_error_code TEXT CHECK (
    last_error_code IS NULL OR char_length(last_error_code) BETWEEN 1 AND 100
  ),
  last_error_message TEXT CHECK (
    last_error_message IS NULL OR char_length(last_error_message) <= 2000
  ),
  created_by UUID NOT NULL REFERENCES team_members(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (brief_id, config_version),
  UNIQUE (tenant_id, idempotency_key),
  UNIQUE (id, config_version, config_hash),
  CHECK (
    (state = 'FAILED_RETRYABLE' AND retry_from_state IN ('EXECUTING', 'ENABLING'))
    OR (state <> 'FAILED_RETRYABLE' AND retry_from_state IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_campaign_launches_tenant_state
  ON campaign_launches (tenant_id, state, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_campaign_launches_client
  ON campaign_launches (tenant_id, client_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_campaign_launches_connection
  ON campaign_launches (tenant_id, connection_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS campaign_launch_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  launch_id UUID NOT NULL,
  config_version INTEGER NOT NULL CHECK (config_version > 0),
  config_hash TEXT NOT NULL CHECK (
    char_length(config_hash) = 64
    AND config_hash ~ '^[a-f0-9]{64}$'
  ),
  approval_kind TEXT NOT NULL CHECK (approval_kind IN ('create', 'activate')),
  approved_by UUID NOT NULL REFERENCES team_members(id) ON DELETE RESTRICT,
  reason TEXT NOT NULL CHECK (char_length(reason) BETWEEN 10 AND 1000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (launch_id, config_version, config_hash)
    REFERENCES campaign_launches (id, config_version, config_hash) ON DELETE RESTRICT,
  UNIQUE (launch_id, config_version, approval_kind, approved_by)
);

CREATE INDEX IF NOT EXISTS idx_campaign_launch_approvals_launch
  ON campaign_launch_approvals (launch_id, config_version, created_at DESC);

CREATE TABLE IF NOT EXISTS campaign_launch_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  launch_id UUID NOT NULL,
  config_version INTEGER NOT NULL CHECK (config_version > 0),
  config_hash TEXT NOT NULL CHECK (
    char_length(config_hash) = 64
    AND config_hash ~ '^[a-f0-9]{64}$'
  ),
  event_type TEXT NOT NULL CHECK (char_length(event_type) BETWEEN 1 AND 100),
  from_state TEXT,
  to_state TEXT NOT NULL,
  actor_id UUID NOT NULL REFERENCES team_members(id) ON DELETE RESTRICT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (
    jsonb_typeof(payload) = 'object'
    AND octet_length(payload::text) <= 32768
    AND NOT campaign_launch_payload_has_sensitive_keys(payload)
  ),
  provider_request_id TEXT CHECK (
    provider_request_id IS NULL OR char_length(provider_request_id) BETWEEN 1 AND 255
  ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (launch_id, config_version, config_hash)
    REFERENCES campaign_launches (id, config_version, config_hash) ON DELETE RESTRICT,
  CHECK (from_state IS NULL OR from_state IN (
    'DRAFT', 'PREFLIGHT_FAILED', 'READY_FOR_APPROVAL', 'APPROVED', 'EXECUTING',
    'CREATED_PAUSED', 'VERIFICATION_FAILED', 'VERIFIED_PAUSED',
    'ACTIVATION_APPROVED', 'ENABLING', 'ENABLED_VERIFIED', 'FAILED_RETRYABLE',
    'RECOVERY_REQUIRED', 'CANCELLED'
  )),
  CHECK (to_state IN (
    'DRAFT', 'PREFLIGHT_FAILED', 'READY_FOR_APPROVAL', 'APPROVED', 'EXECUTING',
    'CREATED_PAUSED', 'VERIFICATION_FAILED', 'VERIFIED_PAUSED',
    'ACTIVATION_APPROVED', 'ENABLING', 'ENABLED_VERIFIED', 'FAILED_RETRYABLE',
    'RECOVERY_REQUIRED', 'CANCELLED'
  ))
);

CREATE INDEX IF NOT EXISTS idx_campaign_launch_events_timeline
  ON campaign_launch_events (launch_id, created_at, id);

CREATE OR REPLACE FUNCTION prevent_campaign_launch_ledger_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION '% is append-only; insert a correcting event instead', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql
   SECURITY INVOKER
   SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_campaign_launch_approvals_append_only
  ON campaign_launch_approvals;
CREATE TRIGGER trg_campaign_launch_approvals_append_only
  BEFORE UPDATE OR DELETE ON campaign_launch_approvals
  FOR EACH ROW EXECUTE FUNCTION prevent_campaign_launch_ledger_mutation();

DROP TRIGGER IF EXISTS trg_campaign_launch_approvals_no_truncate
  ON campaign_launch_approvals;
CREATE TRIGGER trg_campaign_launch_approvals_no_truncate
  BEFORE TRUNCATE ON campaign_launch_approvals
  FOR EACH STATEMENT EXECUTE FUNCTION prevent_campaign_launch_ledger_mutation();

DROP TRIGGER IF EXISTS trg_campaign_launch_events_append_only
  ON campaign_launch_events;
CREATE TRIGGER trg_campaign_launch_events_append_only
  BEFORE UPDATE OR DELETE ON campaign_launch_events
  FOR EACH ROW EXECUTE FUNCTION prevent_campaign_launch_ledger_mutation();

DROP TRIGGER IF EXISTS trg_campaign_launch_events_no_truncate
  ON campaign_launch_events;
CREATE TRIGGER trg_campaign_launch_events_no_truncate
  BEFORE TRUNCATE ON campaign_launch_events
  FOR EACH STATEMENT EXECUTE FUNCTION prevent_campaign_launch_ledger_mutation();

CREATE OR REPLACE FUNCTION enforce_campaign_launch_approval_state()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.state IS DISTINCT FROM NEW.state THEN
    IF NEW.state = 'APPROVED' AND OLD.state <> 'READY_FOR_APPROVAL' THEN
      RAISE EXCEPTION 'APPROVED state requires READY_FOR_APPROVAL source state';
    END IF;
    IF NEW.state = 'ACTIVATION_APPROVED' AND OLD.state <> 'VERIFIED_PAUSED' THEN
      RAISE EXCEPTION 'ACTIVATION_APPROVED state requires VERIFIED_PAUSED source state';
    END IF;
  END IF;

  IF NEW.state = 'APPROVED'
    AND (TG_OP = 'INSERT' OR OLD.state IS DISTINCT FROM NEW.state)
    AND NOT EXISTS (
    SELECT 1 FROM campaign_launch_approvals approval
     WHERE approval.launch_id = NEW.id
       AND approval.config_version = NEW.config_version
       AND approval.config_hash = NEW.config_hash
       AND approval.approval_kind = 'create'
  ) THEN
    RAISE EXCEPTION 'APPROVED state requires matching creation approval evidence';
  END IF;

  IF NEW.state = 'ACTIVATION_APPROVED'
    AND (TG_OP = 'INSERT' OR OLD.state IS DISTINCT FROM NEW.state)
    AND NOT EXISTS (
    SELECT 1 FROM campaign_launch_approvals approval
     WHERE approval.launch_id = NEW.id
       AND approval.config_version = NEW.config_version
       AND approval.config_hash = NEW.config_hash
       AND approval.approval_kind = 'activate'
  ) THEN
    RAISE EXCEPTION 'ACTIVATION_APPROVED state requires matching activation approval evidence';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql
   SECURITY INVOKER
   SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_campaign_launch_approval_state
  ON campaign_launches;
CREATE TRIGGER trg_campaign_launch_approval_state
  BEFORE INSERT OR UPDATE OF state ON campaign_launches
  FOR EACH ROW EXECUTE FUNCTION enforce_campaign_launch_approval_state();

CREATE OR REPLACE FUNCTION enforce_campaign_launch_state_transition()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.state IS NOT DISTINCT FROM NEW.state THEN
    IF OLD.state = 'FAILED_RETRYABLE'
      AND OLD.retry_from_state IS DISTINCT FROM NEW.retry_from_state THEN
      RAISE EXCEPTION 'campaign launch retry phase is immutable while retryable';
    END IF;
    RETURN NEW;
  END IF;

  IF NOT (
    (OLD.state = 'DRAFT' AND NEW.state IN ('PREFLIGHT_FAILED', 'READY_FOR_APPROVAL', 'CANCELLED'))
    OR (OLD.state = 'PREFLIGHT_FAILED' AND NEW.state IN ('DRAFT', 'READY_FOR_APPROVAL', 'CANCELLED'))
    OR (OLD.state = 'READY_FOR_APPROVAL' AND NEW.state IN ('DRAFT', 'PREFLIGHT_FAILED', 'APPROVED', 'CANCELLED'))
    OR (OLD.state = 'APPROVED' AND NEW.state IN ('EXECUTING', 'CANCELLED'))
    OR (OLD.state = 'EXECUTING' AND NEW.state IN ('CREATED_PAUSED', 'FAILED_RETRYABLE', 'RECOVERY_REQUIRED'))
    OR (OLD.state = 'CREATED_PAUSED' AND NEW.state IN ('VERIFICATION_FAILED', 'VERIFIED_PAUSED', 'RECOVERY_REQUIRED'))
    OR (OLD.state = 'VERIFICATION_FAILED' AND NEW.state IN ('VERIFIED_PAUSED', 'RECOVERY_REQUIRED'))
    OR (OLD.state = 'VERIFIED_PAUSED' AND NEW.state = 'ACTIVATION_APPROVED')
    OR (OLD.state = 'ACTIVATION_APPROVED' AND NEW.state = 'ENABLING')
    OR (OLD.state = 'ENABLING' AND NEW.state IN ('ENABLED_VERIFIED', 'FAILED_RETRYABLE', 'RECOVERY_REQUIRED'))
    OR (OLD.state = 'FAILED_RETRYABLE' AND NEW.state IN ('EXECUTING', 'ENABLING', 'RECOVERY_REQUIRED'))
  ) THEN
    RAISE EXCEPTION 'invalid campaign launch state transition: % -> %', OLD.state, NEW.state;
  END IF;

  IF OLD.state = 'FAILED_RETRYABLE'
    AND NEW.state IN ('EXECUTING', 'ENABLING')
    AND OLD.retry_from_state IS DISTINCT FROM NEW.state THEN
    RAISE EXCEPTION 'campaign launch retry must resume its recorded phase';
  END IF;
  IF NEW.state = 'FAILED_RETRYABLE'
    AND NEW.retry_from_state IS DISTINCT FROM OLD.state THEN
    RAISE EXCEPTION 'campaign launch failure must record its execution phase';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql
   SECURITY INVOKER
   SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_campaign_launch_state_transition
  ON campaign_launches;
CREATE TRIGGER trg_campaign_launch_state_transition
  BEFORE UPDATE OF state, retry_from_state ON campaign_launches
  FOR EACH ROW EXECUTE FUNCTION enforce_campaign_launch_state_transition();

CREATE OR REPLACE FUNCTION validate_campaign_launch_approval_source_state()
RETURNS TRIGGER AS $$
DECLARE
  launch_state TEXT;
  required_state TEXT;
BEGIN
  required_state := CASE NEW.approval_kind
    WHEN 'create' THEN 'READY_FOR_APPROVAL'
    WHEN 'activate' THEN 'VERIFIED_PAUSED'
  END;
  SELECT state INTO launch_state FROM campaign_launches WHERE id = NEW.launch_id;
  IF launch_state IS DISTINCT FROM required_state THEN
    RAISE EXCEPTION '% approval requires launch state %', NEW.approval_kind, required_state;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql
   SECURITY INVOKER
   SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION validate_campaign_launch_approval_final_state()
RETURNS TRIGGER AS $$
DECLARE
  launch_state TEXT;
  required_state TEXT;
BEGIN
  required_state := CASE NEW.approval_kind
    WHEN 'create' THEN 'APPROVED'
    WHEN 'activate' THEN 'ACTIVATION_APPROVED'
  END;
  SELECT state INTO launch_state FROM campaign_launches WHERE id = NEW.launch_id;
  IF launch_state IS DISTINCT FROM required_state THEN
    RAISE EXCEPTION '% approval and state transition must commit atomically', NEW.approval_kind;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql
   SECURITY INVOKER
   SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_campaign_launch_approval_source_state
  ON campaign_launch_approvals;
CREATE TRIGGER trg_campaign_launch_approval_source_state
  BEFORE INSERT ON campaign_launch_approvals
  FOR EACH ROW EXECUTE FUNCTION validate_campaign_launch_approval_source_state();

DROP TRIGGER IF EXISTS trg_campaign_launch_approval_final_state
  ON campaign_launch_approvals;
CREATE CONSTRAINT TRIGGER trg_campaign_launch_approval_final_state
  AFTER INSERT ON campaign_launch_approvals
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION validate_campaign_launch_approval_final_state();

CREATE OR REPLACE FUNCTION prevent_campaign_launch_identity_mutation()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'campaign launches cannot be deleted';
  END IF;

  IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
     OR NEW.brief_id IS DISTINCT FROM OLD.brief_id
     OR NEW.client_id IS DISTINCT FROM OLD.client_id
     OR NEW.connection_id IS DISTINCT FROM OLD.connection_id
     OR NEW.platform IS DISTINCT FROM OLD.platform
     OR NEW.campaign_type IS DISTINCT FROM OLD.campaign_type
     OR NEW.config_version IS DISTINCT FROM OLD.config_version
     OR NEW.config_hash IS DISTINCT FROM OLD.config_hash
     OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
     OR NEW.normalized_config IS DISTINCT FROM OLD.normalized_config
     OR NEW.created_by IS DISTINCT FROM OLD.created_by
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'campaign launch identity and normalized configuration are immutable';
  END IF;

  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql
   SECURITY INVOKER
   SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_campaign_launch_identity_immutable
  ON campaign_launches;
CREATE TRIGGER trg_campaign_launch_identity_immutable
  BEFORE UPDATE OR DELETE ON campaign_launches
  FOR EACH ROW EXECUTE FUNCTION prevent_campaign_launch_identity_mutation();

COMMENT ON TABLE campaign_launches IS
  'Immutable versioned launch plans with mutable lifecycle, preflight and provider read-back state.';
COMMENT ON TABLE campaign_launch_approvals IS
  'Append-only human approvals bound to one exact launch version and canonical hash.';
COMMENT ON TABLE campaign_launch_events IS
  'Append-only sanitized launch lifecycle timeline; payloads are bounded operational evidence.';

COMMIT;
