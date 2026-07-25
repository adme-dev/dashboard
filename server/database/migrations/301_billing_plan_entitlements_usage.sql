BEGIN;

CREATE TABLE IF NOT EXISTS billing_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE CHECK (code ~ '^[a-z][a-z0-9._-]{1,79}$'),
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 2 AND 120),
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'active', 'retired')),
  billing_period TEXT NOT NULL DEFAULT 'monthly'
    CHECK (billing_period IN ('monthly', 'annual', 'custom')),
  currency TEXT NOT NULL DEFAULT 'AUD' CHECK (currency ~ '^[A-Z]{3}$'),
  base_price_minor BIGINT NOT NULL DEFAULT 0 CHECK (base_price_minor >= 0),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS billing_plan_entitlements (
  plan_id UUID NOT NULL REFERENCES billing_plans(id) ON DELETE CASCADE,
  feature_key TEXT NOT NULL CHECK (feature_key ~ '^[a-z][a-z0-9._-]{1,119}$'),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('trial', 'active', 'grace', 'capped', 'overdue', 'suspended', 'cancelled')),
  limits JSONB NOT NULL DEFAULT '{}'::jsonb,
  metered BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (plan_id, feature_key)
);

CREATE TABLE IF NOT EXISTS client_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES billing_plans(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'trial'
    CHECK (status IN ('trial', 'active', 'grace', 'overdue', 'suspended', 'cancelled')),
  billing_provider TEXT NOT NULL DEFAULT 'manual',
  external_subscription_ref TEXT,
  current_period_starts_at TIMESTAMPTZ,
  current_period_ends_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (client_id, id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_client_subscriptions_one_current
  ON client_subscriptions (client_id)
  WHERE status IN ('trial', 'active', 'grace', 'overdue', 'suspended');

CREATE TABLE IF NOT EXISTS client_entitlement_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  feature_key TEXT NOT NULL CHECK (feature_key ~ '^[a-z][a-z0-9._-]{1,119}$'),
  status TEXT NOT NULL
    CHECK (status IN ('trial', 'active', 'grace', 'capped', 'overdue', 'suspended', 'cancelled')),
  limits JSONB NOT NULL DEFAULT '{}'::jsonb,
  reason TEXT NOT NULL CHECK (char_length(reason) BETWEEN 3 AND 1000),
  starts_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (client_id, feature_key)
);

CREATE TABLE IF NOT EXISTS billing_usage_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  feature_key TEXT NOT NULL CHECK (feature_key ~ '^[a-z][a-z0-9._-]{1,119}$'),
  meter_key TEXT NOT NULL CHECK (meter_key ~ '^[a-z][a-z0-9._-]{1,119}$'),
  quantity NUMERIC(20, 6) NOT NULL CHECK (quantity >= 0),
  unit TEXT NOT NULL CHECK (char_length(unit) BETWEEN 1 AND 40),
  provider_cost_minor BIGINT CHECK (provider_cost_minor IS NULL OR provider_cost_minor >= 0),
  currency TEXT NOT NULL DEFAULT 'AUD' CHECK (currency ~ '^[A-Z]{3}$'),
  source_system TEXT NOT NULL CHECK (char_length(source_system) BETWEEN 1 AND 80),
  source_event_id TEXT NOT NULL CHECK (char_length(source_event_id) BETWEEN 1 AND 255),
  idempotency_key TEXT NOT NULL CHECK (char_length(idempotency_key) BETWEEN 8 AND 255),
  occurred_at TIMESTAMPTZ NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (client_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_billing_usage_events_meter
  ON billing_usage_events (client_id, feature_key, meter_key, occurred_at DESC);

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

CREATE INDEX IF NOT EXISTS idx_billing_entitlement_audit_client
  ON billing_entitlement_audit (client_id, occurred_at DESC);

DROP TRIGGER IF EXISTS trg_billing_usage_events_append_only ON billing_usage_events;
CREATE TRIGGER trg_billing_usage_events_append_only
  BEFORE UPDATE OR DELETE ON billing_usage_events
  FOR EACH ROW EXECUTE FUNCTION prevent_measurement_append_only_mutation();

DROP TRIGGER IF EXISTS trg_billing_entitlement_audit_append_only ON billing_entitlement_audit;
CREATE TRIGGER trg_billing_entitlement_audit_append_only
  BEFORE UPDATE OR DELETE ON billing_entitlement_audit
  FOR EACH ROW EXECUTE FUNCTION prevent_measurement_append_only_mutation();

CREATE OR REPLACE FUNCTION audit_client_feature_entitlement_change()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO billing_entitlement_audit (
    client_id, feature_key, action, previous_status, next_status, source
  ) VALUES (
    COALESCE(NEW.client_id, OLD.client_id),
    COALESCE(NEW.feature_key, OLD.feature_key),
    LOWER(TG_OP),
    CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN OLD.status ELSE NULL END,
    CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN NEW.status ELSE NULL END,
    'client_feature_entitlements'
  );
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_client_feature_entitlements_audit
  ON client_feature_entitlements;
CREATE TRIGGER trg_client_feature_entitlements_audit
  AFTER INSERT OR UPDATE OR DELETE ON client_feature_entitlements
  FOR EACH ROW EXECUTE FUNCTION audit_client_feature_entitlement_change();

INSERT INTO billing_plans (code, name, status, billing_period, currency)
VALUES
  ('capture', 'Lead Capture', 'active', 'monthly', 'AUD'),
  ('crm', 'Client CRM', 'active', 'monthly', 'AUD'),
  ('enterprise', 'Enterprise Intelligence', 'active', 'custom', 'AUD')
ON CONFLICT (code) DO NOTHING;

INSERT INTO billing_plan_entitlements (plan_id, feature_key, status, metered)
SELECT plan.id, feature.feature_key, 'active', feature.metered
FROM billing_plans plan
JOIN (
  VALUES
    ('crm', 'crm.core', FALSE),
    ('crm', 'catalog.sync', FALSE),
    ('crm', 'mobile.crm', FALSE),
    ('enterprise', 'crm.core', FALSE),
    ('enterprise', 'catalog.sync', FALSE),
    ('enterprise', 'mobile.crm', FALSE),
    ('enterprise', 'persona.identity', FALSE),
    ('enterprise', 'audience.google', TRUE),
    ('enterprise', 'audience.meta', TRUE),
    ('enterprise', 'communications.sms', TRUE),
    ('enterprise', 'communications.voice', TRUE),
    ('enterprise', 'ai.receptionist', TRUE),
    ('enterprise', 'mcp.crm', TRUE)
) AS feature(plan_code, feature_key, metered)
  ON feature.plan_code = plan.code
ON CONFLICT (plan_id, feature_key) DO NOTHING;

COMMIT;
