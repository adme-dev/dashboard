-- Privacy-minimized, signed dealer-platform evidence boundary. Evidence is
-- append-only and tenant scoped; it never grants server-side Google delivery.

BEGIN;

ALTER TABLE outcome_endpoints
  ADD COLUMN IF NOT EXISTS allow_server_delivery BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS browser_server_dedup_validated BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE outcome_endpoints
  DROP CONSTRAINT IF EXISTS outcome_endpoints_server_delivery_dedup_check;
ALTER TABLE outcome_endpoints
  ADD CONSTRAINT outcome_endpoints_server_delivery_dedup_check
  CHECK (NOT browser_server_dedup_validated OR allow_server_delivery);

CREATE TABLE IF NOT EXISTS measurement_evidence_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE RESTRICT,
  profile_id UUID NOT NULL,
  endpoint_id UUID NOT NULL,
  source_system TEXT NOT NULL CHECK (char_length(source_system) BETWEEN 1 AND 100),
  source_event_id TEXT NOT NULL CHECK (char_length(source_event_id) BETWEEN 1 AND 255),
  external_site_id TEXT NOT NULL CHECK (char_length(external_site_id) BETWEEN 1 AND 255),
  browser_transaction_id TEXT CHECK (
    browser_transaction_id IS NULL OR char_length(browser_transaction_id) BETWEEN 1 AND 255
  ),
  canonical_event_name TEXT NOT NULL CHECK (canonical_event_name IN (
    'lead_created', 'lead_contacted', 'lead_qualified', 'lead_won',
    'lead_lost', 'purchase', 'web_conversion', 'phone_click',
    'directions_click', 'add_to_wishlist', 'form_submit'
  )),
  enquiry_type TEXT CHECK (enquiry_type IS NULL OR enquiry_type IN (
    'stock', 'finance', 'test_drive', 'contact', 'model_variant', 'service_booking'
  )),
  conversion_value NUMERIC(18, 6),
  currency TEXT CHECK (currency IS NULL OR currency ~ '^[A-Z]{3}$'),
  occurred_at TIMESTAMPTZ NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  analytics_consent TEXT NOT NULL CHECK (analytics_consent IN ('granted', 'denied', 'not_required')),
  advertising_consent TEXT NOT NULL CHECK (advertising_consent IN ('granted', 'denied', 'not_required')),
  call_id TEXT CHECK (call_id IS NULL OR char_length(call_id) BETWEEN 1 AND 255),
  call_status TEXT CHECK (call_status IS NULL OR call_status IN (
    'initiated', 'connected', 'not_connected', 'completed', 'failed'
  )),
  call_duration_seconds INTEGER CHECK (call_duration_seconds IS NULL OR call_duration_seconds >= 0),
  call_qualification_threshold_seconds INTEGER CHECK (
    call_qualification_threshold_seconds IS NULL OR call_qualification_threshold_seconds >= 0
  ),
  call_qualified BOOLEAN,
  call_campaign_resource_name TEXT CHECK (
    call_campaign_resource_name IS NULL
    OR call_campaign_resource_name ~ '^customers/[0-9]{1,20}/campaigns/[0-9]{1,20}$'
  ),
  call_ad_resource_name TEXT CHECK (
    call_ad_resource_name IS NULL
    OR call_ad_resource_name ~ '^customers/[0-9]{1,20}/ads/[0-9]{1,20}$'
  ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (client_id, id),
  UNIQUE (client_id, source_system, source_event_id),
  FOREIGN KEY (client_id, profile_id)
    REFERENCES client_measurement_profiles(client_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (client_id, endpoint_id)
    REFERENCES outcome_endpoints(client_id, id) ON DELETE RESTRICT,
  CHECK ((conversion_value IS NULL) = (currency IS NULL)),
  CHECK (canonical_event_name = 'web_conversion' OR enquiry_type IS NULL)
);

CREATE INDEX IF NOT EXISTS idx_measurement_evidence_events_reconcile
  ON measurement_evidence_events (client_id, canonical_event_name, enquiry_type, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_measurement_evidence_events_call
  ON measurement_evidence_events (client_id, occurred_at DESC)
  WHERE call_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS measurement_evidence_stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE RESTRICT,
  evidence_event_id UUID NOT NULL,
  stage TEXT NOT NULL CHECK (stage IN (
    'captured', 'consent_decision', 'destination_configured',
    'delivery_attempted', 'provider_accepted', 'provider_reporting_observed'
  )),
  outcome TEXT NOT NULL CHECK (outcome IN (
    'observed', 'attempted', 'skipped', 'delivered', 'failed', 'accepted', 'reported'
  )),
  destination TEXT CHECK (destination IS NULL OR destination IN (
    'google_ads', 'ga4', 'meta_ads', 'linkedin_ads', 'tiktok_ads', 'other'
  )),
  delivery_channel TEXT CHECK (delivery_channel IS NULL OR delivery_channel IN ('browser', 'server', 'provider')),
  provider_action_resource_name TEXT CHECK (
    provider_action_resource_name IS NULL
    OR provider_action_resource_name ~ '^customers/[0-9]{1,20}/conversionActions/[0-9]{1,20}$'
  ),
  provider_event_id TEXT CHECK (
    provider_event_id IS NULL OR char_length(provider_event_id) BETWEEN 1 AND 255
  ),
  diagnostic_code TEXT CHECK (
    diagnostic_code IS NULL OR diagnostic_code ~ '^[a-z][a-z0-9_]{0,99}$'
  ),
  occurred_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (client_id, evidence_event_id)
    REFERENCES measurement_evidence_events(client_id, id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_measurement_evidence_stages_reconcile
  ON measurement_evidence_stages (client_id, stage, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_measurement_evidence_stages_unique
  ON measurement_evidence_stages (
    client_id, evidence_event_id, stage,
    COALESCE(destination, '__none__'),
    COALESCE(delivery_channel, '__none__'),
    COALESCE(provider_action_resource_name, '__none__')
  );

CREATE TABLE IF NOT EXISTS measurement_evidence_nonces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  endpoint_id UUID NOT NULL,
  nonce_sha256 TEXT NOT NULL CHECK (nonce_sha256 ~ '^[a-f0-9]{64}$'),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (client_id, endpoint_id)
    REFERENCES outcome_endpoints(client_id, id) ON DELETE CASCADE,
  UNIQUE (endpoint_id, nonce_sha256)
);

CREATE INDEX IF NOT EXISTS idx_measurement_evidence_nonces_expiry
  ON measurement_evidence_nonces (expires_at);

CREATE OR REPLACE FUNCTION prevent_measurement_evidence_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'measurement evidence is append-only';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_measurement_evidence_events_append_only ON measurement_evidence_events;
CREATE TRIGGER trg_measurement_evidence_events_append_only
BEFORE UPDATE OR DELETE ON measurement_evidence_events
FOR EACH ROW EXECUTE FUNCTION prevent_measurement_evidence_mutation();

DROP TRIGGER IF EXISTS trg_measurement_evidence_stages_append_only ON measurement_evidence_stages;
CREATE TRIGGER trg_measurement_evidence_stages_append_only
BEFORE UPDATE OR DELETE ON measurement_evidence_stages
FOR EACH ROW EXECUTE FUNCTION prevent_measurement_evidence_mutation();

COMMIT;
