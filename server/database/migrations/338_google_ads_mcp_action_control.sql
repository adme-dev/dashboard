-- 338_google_ads_mcp_action_control.sql
-- Durable, tenant-bound plans and append-only evidence for governed Google Ads mutations.

BEGIN;

CREATE TABLE IF NOT EXISTS google_ads_action_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE RESTRICT,
  connection_id UUID NOT NULL,
  customer_id TEXT NOT NULL CHECK (customer_id ~ '^[0-9]{1,20}$'),
  actor_id UUID NOT NULL REFERENCES team_members(id) ON DELETE RESTRICT,
  grant_id TEXT,
  source TEXT NOT NULL CHECK (source IN ('mcp', 'chat', 'ui', 'automation')),
  tool_name TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_name TEXT,
  operation TEXT NOT NULL,
  current_state JSONB NOT NULL,
  desired_state JSONB NOT NULL,
  current_state_fingerprint TEXT NOT NULL CHECK (current_state_fingerprint ~ '^[a-f0-9]{64}$'),
  state_diff JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(state_diff) = 'array'),
  provider_operations JSONB NOT NULL CHECK (jsonb_typeof(provider_operations) = 'array'),
  risk_tier TEXT NOT NULL CHECK (risk_tier IN (
    'read', 'automatic', 'confirm', 'rich_confirm', 'destructive_confirm', 'blocked'
  )),
  execution_mode TEXT NOT NULL CHECK (execution_mode IN ('automatic', 'proposal', 'blocked')),
  policy_version TEXT NOT NULL,
  policy_decision JSONB NOT NULL CHECK (jsonb_typeof(policy_decision) = 'object'),
  request_hash TEXT NOT NULL CHECK (request_hash ~ '^[a-f0-9]{64}$'),
  idempotency_key TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN (
    'planned', 'pending_approval', 'approved', 'executing', 'verified',
    'partially_verified', 'provider_rejected', 'verification_failed',
    'recovery_required', 'cancelled', 'expired'
  )),
  approval_id UUID REFERENCES ai_pending_actions(id) ON DELETE SET NULL,
  provider_request_id TEXT,
  verification_summary JSONB,
  result_metadata JSONB,
  claimed_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (client_id, idempotency_key),
  UNIQUE (client_id, id),
  CONSTRAINT fk_google_ads_action_plan_connection_tenant
    FOREIGN KEY (client_id, connection_id)
    REFERENCES social_connections (client_id, id)
    ON UPDATE RESTRICT
    ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_google_ads_action_plans_client_status
  ON google_ads_action_plans (client_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_google_ads_action_plans_connection
  ON google_ads_action_plans (client_id, connection_id, customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_google_ads_action_plans_actor
  ON google_ads_action_plans (client_id, actor_id, created_at DESC);

CREATE TABLE IF NOT EXISTS google_ads_action_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL,
  client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE RESTRICT,
  actor_id UUID REFERENCES team_members(id) ON DELETE RESTRICT,
  event_type TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_google_ads_action_event_plan_tenant
    FOREIGN KEY (client_id, plan_id)
    REFERENCES google_ads_action_plans (client_id, id)
    ON UPDATE RESTRICT
    ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_google_ads_action_events_plan
  ON google_ads_action_events (client_id, plan_id, created_at ASC);

CREATE TABLE IF NOT EXISTS google_ads_automation_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE RESTRICT,
  connection_id UUID NOT NULL,
  customer_id TEXT NOT NULL CHECK (customer_id ~ '^[0-9]{1,20}$'),
  action_class TEXT NOT NULL,
  version INTEGER NOT NULL CHECK (version > 0),
  policy_version TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT false,
  conditions JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(conditions) = 'object'),
  max_daily_actions INTEGER CHECK (max_daily_actions IS NULL OR max_daily_actions > 0),
  created_by UUID NOT NULL REFERENCES team_members(id) ON DELETE RESTRICT,
  effective_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  superseded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (client_id, connection_id, customer_id, action_class, version),
  CONSTRAINT fk_google_ads_automation_policy_connection_tenant
    FOREIGN KEY (client_id, connection_id)
    REFERENCES social_connections (client_id, id)
    ON UPDATE RESTRICT
    ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_google_ads_automation_policies_active
  ON google_ads_automation_policies (
    client_id, connection_id, customer_id, action_class, effective_at DESC
  )
  WHERE enabled = true AND superseded_at IS NULL;

CREATE OR REPLACE FUNCTION set_google_ads_action_plan_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION protect_google_ads_action_plan_content()
RETURNS TRIGGER AS $$
DECLARE
  mutable_columns CONSTANT TEXT[] := ARRAY[
    'status', 'approval_id', 'provider_request_id', 'verification_summary',
    'result_metadata', 'claimed_at', 'completed_at', 'updated_at'
  ];
BEGIN
  IF (to_jsonb(NEW) - mutable_columns) IS DISTINCT FROM
     (to_jsonb(OLD) - mutable_columns) THEN
    RAISE EXCEPTION 'Google Ads action plan content is immutable; create a new plan instead';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION prevent_google_ads_action_event_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Google Ads action events are append-only; insert a correcting event instead';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION protect_google_ads_automation_policy_content()
RETURNS TRIGGER AS $$
BEGIN
  IF (to_jsonb(NEW) - 'superseded_at') IS DISTINCT FROM
     (to_jsonb(OLD) - 'superseded_at') THEN
    RAISE EXCEPTION 'Google Ads automation policies are versioned; insert a new version instead';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_google_ads_action_plans_immutable ON google_ads_action_plans;
CREATE TRIGGER trg_google_ads_action_plans_immutable
BEFORE UPDATE ON google_ads_action_plans
FOR EACH ROW EXECUTE FUNCTION protect_google_ads_action_plan_content();

DROP TRIGGER IF EXISTS trg_google_ads_action_plans_updated_at ON google_ads_action_plans;
CREATE TRIGGER trg_google_ads_action_plans_updated_at
BEFORE UPDATE ON google_ads_action_plans
FOR EACH ROW EXECUTE FUNCTION set_google_ads_action_plan_updated_at();

DROP TRIGGER IF EXISTS trg_google_ads_action_events_append_only ON google_ads_action_events;
CREATE TRIGGER trg_google_ads_action_events_append_only
BEFORE UPDATE OR DELETE ON google_ads_action_events
FOR EACH ROW EXECUTE FUNCTION prevent_google_ads_action_event_mutation();

DROP TRIGGER IF EXISTS trg_google_ads_automation_policies_versioned ON google_ads_automation_policies;
CREATE TRIGGER trg_google_ads_automation_policies_versioned
BEFORE UPDATE ON google_ads_automation_policies
FOR EACH ROW EXECUTE FUNCTION protect_google_ads_automation_policy_content();

ALTER TABLE ai_pending_actions
  ADD COLUMN IF NOT EXISTS google_ads_action_plan_id UUID
  REFERENCES google_ads_action_plans(id) ON DELETE RESTRICT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_ai_pending_actions_google_ads_plan
  ON ai_pending_actions (google_ads_action_plan_id)
  WHERE google_ads_action_plan_id IS NOT NULL;

COMMENT ON TABLE google_ads_action_plans IS
  'Tenant-bound immutable intent plus mutable lifecycle state for governed Google Ads changes.';
COMMENT ON TABLE google_ads_action_events IS
  'Append-only, credential-free evidence for Google Ads action planning, approval, execution, and verification.';
COMMENT ON COLUMN google_ads_action_events.metadata IS
  'Bounded redacted metadata only. Never store access tokens, refresh tokens, developer tokens, authorization headers, or credentials.';
COMMENT ON TABLE google_ads_automation_policies IS
  'Versioned client/account policy grants for narrowly bounded automatic Google Ads actions.';

COMMIT;
