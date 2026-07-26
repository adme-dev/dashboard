BEGIN;

ALTER TABLE client_subscriptions
  ADD COLUMN IF NOT EXISTS updated_by UUID;

ALTER TABLE client_entitlement_overrides
  ADD COLUMN IF NOT EXISTS updated_by UUID;

CREATE TABLE IF NOT EXISTS billing_subscription_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  subscription_id UUID,
  action TEXT NOT NULL,
  previous_plan_id UUID,
  next_plan_id UUID,
  previous_status TEXT,
  next_status TEXT,
  actor_id UUID,
  source TEXT NOT NULL DEFAULT 'database_trigger',
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_billing_subscription_audit_client
  ON billing_subscription_audit (client_id, occurred_at DESC);

DROP TRIGGER IF EXISTS trg_billing_subscription_audit_append_only
  ON billing_subscription_audit;
CREATE TRIGGER trg_billing_subscription_audit_append_only
  BEFORE UPDATE OR DELETE ON billing_subscription_audit
  FOR EACH ROW EXECUTE FUNCTION prevent_measurement_append_only_mutation();

CREATE OR REPLACE FUNCTION audit_client_subscription_change()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO billing_subscription_audit (
    client_id,
    subscription_id,
    action,
    previous_plan_id,
    next_plan_id,
    previous_status,
    next_status,
    actor_id
  ) VALUES (
    COALESCE(NEW.client_id, OLD.client_id),
    COALESCE(NEW.id, OLD.id),
    LOWER(TG_OP),
    CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN OLD.plan_id ELSE NULL END,
    CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN NEW.plan_id ELSE NULL END,
    CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN OLD.status ELSE NULL END,
    CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN NEW.status ELSE NULL END,
    COALESCE(NEW.updated_by, OLD.updated_by)
  );
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_client_subscriptions_audit ON client_subscriptions;
CREATE TRIGGER trg_client_subscriptions_audit
  AFTER INSERT OR UPDATE OR DELETE ON client_subscriptions
  FOR EACH ROW EXECUTE FUNCTION audit_client_subscription_change();

CREATE OR REPLACE FUNCTION audit_client_entitlement_override_change()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO billing_entitlement_audit (
    client_id,
    feature_key,
    action,
    previous_status,
    next_status,
    actor_id,
    source,
    metadata
  ) VALUES (
    COALESCE(NEW.client_id, OLD.client_id),
    COALESCE(NEW.feature_key, OLD.feature_key),
    'override_' || LOWER(TG_OP),
    CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN OLD.status ELSE NULL END,
    CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN NEW.status ELSE NULL END,
    COALESCE(NEW.updated_by, NEW.created_by, OLD.updated_by, OLD.created_by),
    'client_entitlement_overrides',
    jsonb_build_object(
      'reason', COALESCE(NEW.reason, OLD.reason),
      'expiresAt', COALESCE(NEW.expires_at, OLD.expires_at)
    )
  );
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_client_entitlement_overrides_audit
  ON client_entitlement_overrides;
CREATE TRIGGER trg_client_entitlement_overrides_audit
  AFTER INSERT OR UPDATE OR DELETE ON client_entitlement_overrides
  FOR EACH ROW EXECUTE FUNCTION audit_client_entitlement_override_change();

COMMENT ON TABLE billing_subscription_audit IS
  'Append-only agency audit trail for client subscription plan and status changes.';

COMMIT;
