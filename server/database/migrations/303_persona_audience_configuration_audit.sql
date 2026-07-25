CREATE TABLE IF NOT EXISTS crm_persona_audience_configuration_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('google_ads', 'meta')),
  actor_id UUID NOT NULL,
  action TEXT NOT NULL CHECK (
    action IN (
      'entitlement_enabled',
      'entitlement_suspended',
      'provider_configured',
      'provider_disabled',
      'emergency_stopped',
      'emergency_resumed',
      'terms_accepted'
    )
  ),
  reason TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_persona_audience_configuration_audit_client
  ON crm_persona_audience_configuration_audit (client_id, created_at DESC);

CREATE OR REPLACE FUNCTION reject_persona_audience_configuration_audit_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'crm_persona_audience_configuration_audit is append-only';
END;
$$;

DROP TRIGGER IF EXISTS persona_audience_configuration_audit_append_only
  ON crm_persona_audience_configuration_audit;

CREATE TRIGGER persona_audience_configuration_audit_append_only
BEFORE UPDATE OR DELETE ON crm_persona_audience_configuration_audit
FOR EACH ROW
EXECUTE FUNCTION reject_persona_audience_configuration_audit_mutation();

