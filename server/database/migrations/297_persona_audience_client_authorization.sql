BEGIN;

CREATE TABLE IF NOT EXISTS crm_persona_audience_client_authorizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('google_ads', 'meta')),
  status TEXT NOT NULL CHECK (status IN ('accepted', 'withdrawn')),
  policy_version TEXT NOT NULL,
  data_use_scope TEXT NOT NULL DEFAULT 'customer_match_and_personalized_advertising',
  privacy_notice_url TEXT,
  attestations JSONB NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(attestations) = 'object'),
  authorized_by UUID NOT NULL REFERENCES client_users(id) ON DELETE RESTRICT,
  accepted_at TIMESTAMPTZ,
  withdrawn_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (client_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_persona_client_authorizations_status
  ON crm_persona_audience_client_authorizations (client_id, provider, status);

CREATE TABLE IF NOT EXISTS crm_persona_audience_client_authorization_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  authorization_id UUID NOT NULL
    REFERENCES crm_persona_audience_client_authorizations(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('google_ads', 'meta')),
  action TEXT NOT NULL CHECK (action IN ('accepted', 'withdrawn')),
  policy_version TEXT NOT NULL,
  client_user_id UUID NOT NULL REFERENCES client_users(id) ON DELETE RESTRICT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(metadata) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_persona_client_authorization_events
  ON crm_persona_audience_client_authorization_events (client_id, provider, created_at DESC);

DROP TRIGGER IF EXISTS trg_persona_client_authorization_events_append_only
  ON crm_persona_audience_client_authorization_events;
CREATE TRIGGER trg_persona_client_authorization_events_append_only
  BEFORE UPDATE OR DELETE ON crm_persona_audience_client_authorization_events
  FOR EACH ROW EXECUTE FUNCTION prevent_measurement_append_only_mutation();

CREATE OR REPLACE FUNCTION enforce_persona_audience_client_authorization()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.operation = 'sync' AND NOT EXISTS (
    SELECT 1
    FROM crm_persona_audience_client_authorizations client_auth
    WHERE client_auth.client_id = NEW.client_id
      AND client_auth.provider = NEW.provider
      AND client_auth.status = 'accepted'
      AND client_auth.accepted_at IS NOT NULL
      AND client_auth.withdrawn_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Client authorization is required for % audience additions', NEW.provider
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_persona_audience_exports_client_authorization
  ON crm_persona_audience_exports;
CREATE TRIGGER trg_persona_audience_exports_client_authorization
  BEFORE INSERT OR UPDATE OF operation, status ON crm_persona_audience_exports
  FOR EACH ROW EXECUTE FUNCTION enforce_persona_audience_client_authorization();

COMMENT ON TABLE crm_persona_audience_client_authorizations IS
  'Current client-controller authorization for provider audience use. This is separate from person-level marketing consent.';
COMMENT ON TABLE crm_persona_audience_client_authorization_events IS
  'Append-only evidence of client portal audience authorization and withdrawal.';
COMMENT ON FUNCTION enforce_persona_audience_client_authorization() IS
  'Blocks provider audience additions without current client authorization while always permitting removal exports.';

COMMIT;
