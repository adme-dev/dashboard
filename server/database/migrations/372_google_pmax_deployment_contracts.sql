-- 372_google_pmax_deployment_contracts.sql
-- Exact, versioned identity boundary shared by source inventory, Merchant,
-- Google Ads, campaign intent and first-party measurement.

BEGIN;

CREATE TABLE IF NOT EXISTS google_pmax_deployment_contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE RESTRICT,
  contract_version INTEGER NOT NULL CHECK (contract_version > 0),
  contract_hash TEXT NOT NULL CHECK (
    char_length(contract_hash) = 64
    AND contract_hash ~ '^[a-f0-9]{64}$'
  ),
  source_connector_id UUID NOT NULL,
  merchant_account_id TEXT NOT NULL CHECK (merchant_account_id ~ '^[0-9]+$'),
  merchant_data_source_id TEXT NOT NULL CHECK (merchant_data_source_id ~ '^[0-9]+$'),
  ads_connection_id UUID NOT NULL REFERENCES social_connections(id) ON DELETE RESTRICT,
  ads_customer_id TEXT NOT NULL CHECK (ads_customer_id ~ '^[0-9]+$'),
  ads_campaign_id TEXT NOT NULL CHECK (ads_campaign_id ~ '^[0-9]+$'),
  tracking_site_id UUID NOT NULL REFERENCES tracking_sites(id) ON DELETE RESTRICT,
  brief_id UUID REFERENCES briefs(id) ON DELETE RESTRICT,
  project_id UUID REFERENCES projects(id) ON DELETE RESTRICT,
  campaign_launch_id UUID REFERENCES campaign_launches(id) ON DELETE RESTRICT,
  normalized_contract JSONB NOT NULL CHECK (
    jsonb_typeof(normalized_contract) = 'object'
    AND octet_length(normalized_contract::text) <= 131072
    AND NOT campaign_launch_payload_has_sensitive_keys(normalized_contract)
  ),
  state TEXT NOT NULL DEFAULT 'DRAFT' CHECK (
    state IN ('DRAFT', 'VERIFIED', 'ACTIVE', 'SUPERSEDED', 'REVOKED')
  ),
  created_by UUID NOT NULL REFERENCES team_members(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  verified_at TIMESTAMPTZ,
  activated_at TIMESTAMPTZ,
  UNIQUE (tenant_id, client_id, contract_version),
  UNIQUE (tenant_id, contract_hash),
  FOREIGN KEY (client_id, source_connector_id)
    REFERENCES crm_catalog_sources(client_id, id) ON DELETE RESTRICT,
  CHECK (normalized_contract ->> 'schemaVersion' = '1'),
  CHECK (normalized_contract ->> 'tenantId' = tenant_id::text),
  CHECK (normalized_contract ->> 'clientId' = client_id::text),
  CHECK (normalized_contract #>> '{source,connectorId}' = source_connector_id::text),
  CHECK (normalized_contract #>> '{merchant,accountId}' = merchant_account_id),
  CHECK (normalized_contract #>> '{merchant,dataSourceId}' = merchant_data_source_id),
  CHECK (normalized_contract #>> '{ads,connectionId}' = ads_connection_id::text),
  CHECK (normalized_contract #>> '{ads,customerId}' = ads_customer_id),
  CHECK (normalized_contract #>> '{ads,campaignId}' = ads_campaign_id),
  CHECK (normalized_contract #>> '{measurement,trackingSiteId}' = tracking_site_id::text),
  CHECK (state NOT IN ('VERIFIED', 'ACTIVE') OR verified_at IS NOT NULL),
  CHECK (state <> 'DRAFT' OR verified_at IS NULL),
  CHECK (state <> 'ACTIVE' OR activated_at IS NOT NULL),
  CHECK (state NOT IN ('DRAFT', 'VERIFIED') OR activated_at IS NULL)
);

CREATE INDEX IF NOT EXISTS idx_google_pmax_deployment_contracts_client
  ON google_pmax_deployment_contracts (tenant_id, client_id, contract_version DESC);

CREATE INDEX IF NOT EXISTS idx_google_pmax_deployment_contracts_source
  ON google_pmax_deployment_contracts (tenant_id, source_connector_id);

CREATE INDEX IF NOT EXISTS idx_google_pmax_deployment_contracts_merchant
  ON google_pmax_deployment_contracts (
    tenant_id, merchant_account_id, merchant_data_source_id
  );

CREATE UNIQUE INDEX IF NOT EXISTS uq_google_pmax_live_campaign_contract
  ON google_pmax_deployment_contracts (tenant_id, ads_customer_id, ads_campaign_id)
  WHERE state IN ('VERIFIED', 'ACTIVE');

CREATE TABLE IF NOT EXISTS google_pmax_deployment_contract_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deployment_contract_id UUID NOT NULL
    REFERENCES google_pmax_deployment_contracts(id) ON DELETE RESTRICT,
  contract_version INTEGER NOT NULL CHECK (contract_version > 0),
  contract_hash TEXT NOT NULL CHECK (
    char_length(contract_hash) = 64
    AND contract_hash ~ '^[a-f0-9]{64}$'
  ),
  event_type TEXT NOT NULL CHECK (char_length(event_type) BETWEEN 1 AND 100),
  from_state TEXT,
  to_state TEXT NOT NULL,
  actor_id UUID NOT NULL REFERENCES team_members(id) ON DELETE RESTRICT,
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (
    jsonb_typeof(evidence) = 'object'
    AND octet_length(evidence::text) <= 32768
    AND NOT campaign_launch_payload_has_sensitive_keys(evidence)
  ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_google_pmax_deployment_contract_events_timeline
  ON google_pmax_deployment_contract_events (deployment_contract_id, created_at, id);

CREATE OR REPLACE FUNCTION prevent_google_pmax_deployment_contract_identity_mutation()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Google PMax deployment contracts are immutable; revoke or supersede instead';
  END IF;

  IF ROW(
    OLD.tenant_id, OLD.client_id, OLD.contract_version, OLD.contract_hash,
    OLD.source_connector_id, OLD.merchant_account_id, OLD.merchant_data_source_id,
    OLD.ads_connection_id, OLD.ads_customer_id, OLD.ads_campaign_id,
    OLD.tracking_site_id, OLD.normalized_contract, OLD.created_by, OLD.created_at
  ) IS DISTINCT FROM ROW(
    NEW.tenant_id, NEW.client_id, NEW.contract_version, NEW.contract_hash,
    NEW.source_connector_id, NEW.merchant_account_id, NEW.merchant_data_source_id,
    NEW.ads_connection_id, NEW.ads_customer_id, NEW.ads_campaign_id,
    NEW.tracking_site_id, NEW.normalized_contract, NEW.created_by, NEW.created_at
  ) THEN
    RAISE EXCEPTION 'Google PMax deployment contract identity is immutable; create a new version';
  END IF;

  IF OLD.state IS DISTINCT FROM NEW.state AND NOT (
    (OLD.state = 'DRAFT' AND NEW.state IN ('VERIFIED', 'REVOKED'))
    OR (OLD.state = 'VERIFIED' AND NEW.state IN ('ACTIVE', 'SUPERSEDED', 'REVOKED'))
    OR (OLD.state = 'ACTIVE' AND NEW.state IN ('SUPERSEDED', 'REVOKED'))
  ) THEN
    RAISE EXCEPTION 'Invalid Google PMax deployment contract transition: % -> %', OLD.state, NEW.state;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql
   SECURITY INVOKER
   SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_google_pmax_deployment_contract_identity
  ON google_pmax_deployment_contracts;
CREATE TRIGGER trg_google_pmax_deployment_contract_identity
  BEFORE UPDATE OR DELETE ON google_pmax_deployment_contracts
  FOR EACH ROW EXECUTE FUNCTION prevent_google_pmax_deployment_contract_identity_mutation();

DROP TRIGGER IF EXISTS trg_google_pmax_deployment_contract_events_append_only
  ON google_pmax_deployment_contract_events;
CREATE TRIGGER trg_google_pmax_deployment_contract_events_append_only
  BEFORE UPDATE OR DELETE ON google_pmax_deployment_contract_events
  FOR EACH ROW EXECUTE FUNCTION prevent_campaign_launch_ledger_mutation();

DROP TRIGGER IF EXISTS trg_google_pmax_deployment_contracts_no_truncate
  ON google_pmax_deployment_contracts;
CREATE TRIGGER trg_google_pmax_deployment_contracts_no_truncate
  BEFORE TRUNCATE ON google_pmax_deployment_contracts
  FOR EACH STATEMENT EXECUTE FUNCTION prevent_campaign_launch_ledger_mutation();

DROP TRIGGER IF EXISTS trg_google_pmax_deployment_contract_events_no_truncate
  ON google_pmax_deployment_contract_events;
CREATE TRIGGER trg_google_pmax_deployment_contract_events_no_truncate
  BEFORE TRUNCATE ON google_pmax_deployment_contract_events
  FOR EACH STATEMENT EXECUTE FUNCTION prevent_campaign_launch_ledger_mutation();

COMMENT ON TABLE google_pmax_deployment_contracts IS
  'Versioned, client-scoped identity authority for one governed Google PMax inventory deployment.';

COMMIT;
