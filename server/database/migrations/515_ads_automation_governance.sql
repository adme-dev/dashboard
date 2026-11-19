-- 515: Marketing ad-account automation governance core (phase 2) — DORMANT.
-- Additive and idempotent. Nothing reads or writes these tables while the committed
-- ADS_GOVERNANCE_DEFAULTS.automation switch is false (shared/adsGovernanceDefaults.ts).
--
--   ads_automation_controls        singleton global kill switch + hard limits (seeded ENGAGED)
--   ads_automation_control_events  append-only history of every controls change
--   ads_automation_rules           automation rule registry (owner, scope, thresholds, mode, expiry)
--   ads_automation_rule_versions   append-only version history written by trigger on every rule change
--   ads_automation_executions      automated-execution ledger used by daily hard limits
BEGIN;

CREATE TABLE IF NOT EXISTS ads_automation_controls (
  id TEXT PRIMARY KEY DEFAULT 'global' CHECK (id = 'global'),
  kill_switch_engaged BOOLEAN NOT NULL DEFAULT TRUE,
  kill_switch_reason TEXT,
  max_budget_change_pct NUMERIC(6,2) NOT NULL DEFAULT 20 CHECK (max_budget_change_pct > 0 AND max_budget_change_pct <= 100),
  max_changes_per_account_per_day INTEGER NOT NULL DEFAULT 10 CHECK (max_changes_per_account_per_day BETWEEN 0 AND 1000),
  business_timezone TEXT NOT NULL DEFAULT 'Australia/Melbourne',
  business_start_hour INTEGER NOT NULL DEFAULT 9 CHECK (business_start_hour BETWEEN 0 AND 23),
  business_end_hour INTEGER NOT NULL DEFAULT 17 CHECK (business_end_hour BETWEEN 1 AND 24),
  business_days INTEGER[] NOT NULL DEFAULT ARRAY[1,2,3,4,5],
  updated_by UUID REFERENCES team_members(id) ON DELETE RESTRICT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (business_start_hour < business_end_hour),
  CHECK (business_days <@ ARRAY[1,2,3,4,5,6,7])
);

-- Fail safe: the kill switch starts ENGAGED. Releasing it is an explicit, audited owner decision.
INSERT INTO ads_automation_controls (id, kill_switch_engaged, kill_switch_reason)
VALUES ('global', TRUE, 'Initial state: automation not yet approved')
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS ads_automation_control_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID REFERENCES team_members(id) ON DELETE RESTRICT,
  before_state JSONB,
  after_state JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ads_automation_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE RESTRICT,
  scope JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(scope) = 'object'),
  family TEXT NOT NULL CHECK (family ~ '^[a-z][a-z0-9_]{0,99}$'),
  risk_tier TEXT NOT NULL CHECK (risk_tier IN ('read','low','medium','high')),
  thresholds JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(thresholds) = 'object'),
  mode TEXT NOT NULL CHECK (mode IN ('notify','draft','auto_apply')),
  owner_user_id UUID NOT NULL REFERENCES team_members(id) ON DELETE RESTRICT,
  expires_at TIMESTAMPTZ NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  version INTEGER NOT NULL DEFAULT 1,
  created_by UUID NOT NULL REFERENCES team_members(id) ON DELETE RESTRICT,
  updated_by UUID NOT NULL REFERENCES team_members(id) ON DELETE RESTRICT,
  change_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- High-risk families are never automatable, whatever the application layer says.
  CHECK (NOT (risk_tier = 'high' AND mode = 'auto_apply'))
);
CREATE INDEX IF NOT EXISTS ads_automation_rules_client ON ads_automation_rules(client_id, enabled, expires_at);

CREATE TABLE IF NOT EXISTS ads_automation_rule_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id UUID NOT NULL REFERENCES ads_automation_rules(id) ON DELETE RESTRICT,
  version INTEGER NOT NULL,
  change_type TEXT NOT NULL CHECK (change_type IN ('created','updated','enabled','disabled')),
  actor_id UUID NOT NULL REFERENCES team_members(id) ON DELETE RESTRICT,
  reason TEXT,
  before_state JSONB,
  after_state JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (rule_id, version)
);

CREATE TABLE IF NOT EXISTS ads_automation_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id UUID REFERENCES ads_automation_rules(id) ON DELETE RESTRICT,
  client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE RESTRICT,
  platform TEXT NOT NULL CHECK (platform IN ('google_ads','meta')),
  account_id TEXT NOT NULL,
  campaign_id TEXT,
  family TEXT NOT NULL,
  risk_tier TEXT NOT NULL CHECK (risk_tier IN ('low','medium')),
  budget_before NUMERIC(14,2),
  budget_after NUMERIC(14,2),
  status TEXT NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved','succeeded','failed')),
  result JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS ads_automation_executions_account_day ON ads_automation_executions(platform, account_id, created_at);
CREATE INDEX IF NOT EXISTS ads_automation_executions_campaign_day ON ads_automation_executions(platform, account_id, campaign_id, created_at);

-- Append-only guards (same pattern as google_ads_account_binding_events).
CREATE OR REPLACE FUNCTION prevent_ads_automation_history_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS ads_automation_rule_versions_append_only ON ads_automation_rule_versions;
CREATE TRIGGER ads_automation_rule_versions_append_only
  BEFORE UPDATE OR DELETE ON ads_automation_rule_versions
  FOR EACH ROW EXECUTE FUNCTION prevent_ads_automation_history_mutation();

DROP TRIGGER IF EXISTS ads_automation_control_events_append_only ON ads_automation_control_events;
CREATE TRIGGER ads_automation_control_events_append_only
  BEFORE UPDATE OR DELETE ON ads_automation_control_events
  FOR EACH ROW EXECUTE FUNCTION prevent_ads_automation_history_mutation();

-- Rules are never deleted (disable instead), so history always resolves.
DROP TRIGGER IF EXISTS ads_automation_rules_no_delete ON ads_automation_rules;
CREATE TRIGGER ads_automation_rules_no_delete
  BEFORE DELETE ON ads_automation_rules
  FOR EACH ROW EXECUTE FUNCTION prevent_ads_automation_history_mutation();

-- Every rule insert/update bumps the version and writes exactly one immutable version row.
CREATE OR REPLACE FUNCTION ads_automation_rule_version_bump()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.client_id IS DISTINCT FROM OLD.client_id
     OR NEW.created_by IS DISTINCT FROM OLD.created_by OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'ads_automation_rules identity columns are immutable';
  END IF;
  NEW.version := OLD.version + 1;
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS ads_automation_rules_version_bump ON ads_automation_rules;
CREATE TRIGGER ads_automation_rules_version_bump
  BEFORE UPDATE ON ads_automation_rules
  FOR EACH ROW EXECUTE FUNCTION ads_automation_rule_version_bump();

CREATE OR REPLACE FUNCTION ads_automation_rule_record_version()
RETURNS TRIGGER AS $$
DECLARE
  kind TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    kind := 'created';
  ELSIF NEW.enabled IS DISTINCT FROM OLD.enabled
     AND (to_jsonb(NEW) - ARRAY['enabled','version','updated_at','updated_by','change_reason'])
       = (to_jsonb(OLD) - ARRAY['enabled','version','updated_at','updated_by','change_reason']) THEN
    kind := CASE WHEN NEW.enabled THEN 'enabled' ELSE 'disabled' END;
  ELSE
    kind := 'updated';
  END IF;
  INSERT INTO ads_automation_rule_versions (rule_id, version, change_type, actor_id, reason, before_state, after_state)
  VALUES (NEW.id, NEW.version, kind, NEW.updated_by, NEW.change_reason,
          CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE to_jsonb(OLD) END, to_jsonb(NEW));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS ads_automation_rules_record_version ON ads_automation_rules;
CREATE TRIGGER ads_automation_rules_record_version
  AFTER INSERT OR UPDATE ON ads_automation_rules
  FOR EACH ROW EXECUTE FUNCTION ads_automation_rule_record_version();

-- Execution ledger: only outcome columns may change, and only away from 'reserved'; never deleted.
CREATE OR REPLACE FUNCTION protect_ads_automation_execution()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'ads_automation_executions is append-only';
  END IF;
  IF (to_jsonb(NEW) - ARRAY['status','result','completed_at']) IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['status','result','completed_at'])
     OR OLD.status <> 'reserved' THEN
    RAISE EXCEPTION 'ads_automation_executions rows are immutable once settled';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS ads_automation_executions_protect ON ads_automation_executions;
CREATE TRIGGER ads_automation_executions_protect
  BEFORE UPDATE OR DELETE ON ads_automation_executions
  FOR EACH ROW EXECUTE FUNCTION protect_ads_automation_execution();

COMMIT;
