-- 256_measurement_signal_hub.sql
-- Canonical, tenant-scoped Measurement Signal Hub control plane and dormant
-- delivery foundation. No connected account is inferred to be delivery-ready.

BEGIN;

-- Composite unique indexes let new foreign keys prove that a referenced legacy
-- lead/CRM row belongs to the same client as the Measurement row.
CREATE UNIQUE INDEX IF NOT EXISTS uq_leads_client_id_id
  ON leads (client_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_crm_people_client_id_id
  ON crm_people (client_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_crm_opportunities_client_id_id
  ON crm_opportunities (client_id, id);

ALTER TABLE client_users
  ADD COLUMN IF NOT EXISTS can_manage_lead_outcomes BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS client_measurement_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL UNIQUE REFERENCES agency_clients(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  environment TEXT NOT NULL DEFAULT 'test'
    CHECK (environment IN ('test', 'live', 'paused')),
  collection_tier TEXT NOT NULL DEFAULT 'backend_only'
    CHECK (collection_tier IN ('cloudflare_owned', 'first_party_cname', 'shared_endpoint', 'backend_only')),
  tracking_site_id UUID REFERENCES tracking_sites(id) ON DELETE SET NULL,
  first_party_hostname TEXT,
  hostname_status TEXT NOT NULL DEFAULT 'not_required'
    CHECK (hostname_status IN ('not_required', 'pending', 'active', 'error')),
  consent_mode TEXT NOT NULL DEFAULT 'consent_gated'
    CHECK (consent_mode IN ('off', 'au_optout', 'consent_gated')),
  vertical TEXT NOT NULL DEFAULT 'general' CHECK (char_length(vertical) BETWEEN 1 AND 100),
  outcome_authority TEXT NOT NULL DEFAULT 'zero_native'
    CHECK (outcome_authority IN ('zero_native', 'client_webhook', 'connector_sync', 'manual_import')),
  native_lifecycle_mode TEXT NOT NULL DEFAULT 'crm_preferred'
    CHECK (native_lifecycle_mode IN ('crm_preferred', 'leads_only')),
  portal_outcome_mode TEXT NOT NULL DEFAULT 'disabled'
    CHECK (portal_outcome_mode IN ('disabled', 'propose', 'authoritative')),
  config_version INTEGER NOT NULL DEFAULT 1 CHECK (config_version > 0),
  cache_status TEXT NOT NULL DEFAULT 'not_published'
    CHECK (cache_status IN ('not_published', 'fresh', 'stale', 'error')),
  cache_version INTEGER CHECK (cache_version IS NULL OR cache_version > 0),
  cache_error_class TEXT,
  live_approved_by UUID REFERENCES team_members(id) ON DELETE SET NULL,
  live_approved_at TIMESTAMPTZ,
  privacy_approved_by UUID REFERENCES team_members(id) ON DELETE SET NULL,
  privacy_approved_at TIMESTAMPTZ,
  created_by TEXT,
  updated_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (client_id, id),
  CHECK (first_party_hostname IS NULL OR (
    first_party_hostname = LOWER(first_party_hostname)
    AND char_length(first_party_hostname) BETWEEN 1 AND 253
  )),
  CHECK (portal_outcome_mode <> 'authoritative' OR outcome_authority = 'zero_native'),
  CHECK ((live_approved_at IS NULL) = (live_approved_by IS NULL)),
  CHECK ((privacy_approved_at IS NULL) = (privacy_approved_by IS NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_client_measurement_profiles_hostname
  ON client_measurement_profiles (first_party_hostname)
  WHERE first_party_hostname IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_client_measurement_profiles_rollout
  ON client_measurement_profiles (environment, enabled, updated_at DESC);

CREATE TABLE IF NOT EXISTS measurement_config_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL,
  entity_type TEXT NOT NULL
    CHECK (entity_type IN ('profile', 'destination', 'capability', 'mapping', 'outcome_endpoint')),
  entity_id UUID NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('created', 'updated', 'enabled', 'disabled', 'paused', 'validated')),
  config_version INTEGER NOT NULL CHECK (config_version > 0),
  before_state JSONB,
  after_state JSONB,
  changed_fields TEXT[] NOT NULL DEFAULT '{}',
  actor_type TEXT NOT NULL CHECK (actor_type IN ('team_member', 'client_user', 'system', 'import')),
  actor_id TEXT,
  reason TEXT NOT NULL CHECK (char_length(reason) BETWEEN 1 AND 1000),
  request_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (client_id, profile_id)
    REFERENCES client_measurement_profiles(client_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_measurement_config_audit_profile
  ON measurement_config_audit (client_id, profile_id, config_version DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_measurement_config_audit_retention
  ON measurement_config_audit (created_at);

CREATE TABLE IF NOT EXISTS conversion_destinations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('meta', 'google_data_manager')),
  social_connection_id UUID REFERENCES social_connections(id) ON DELETE SET NULL,
  external_destination_id TEXT NOT NULL CHECK (char_length(external_destination_id) BETWEEN 1 AND 255),
  credential_ref TEXT CHECK (
    credential_ref IS NULL OR credential_ref ~ '^[a-zA-Z0-9][a-zA-Z0-9/_:.-]{0,254}$'
  ),
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  environment TEXT NOT NULL DEFAULT 'test'
    CHECK (environment IN ('test', 'live', 'paused')),
  health_status TEXT NOT NULL DEFAULT 'not_configured'
    CHECK (health_status IN ('not_configured', 'detected', 'configured', 'validating', 'ready', 'degraded', 'blocked')),
  config_version INTEGER NOT NULL DEFAULT 1 CHECK (config_version > 0),
  last_validated_at TIMESTAMPTZ,
  last_success_at TIMESTAMPTZ,
  last_failure_at TIMESTAMPTZ,
  provider_request_id TEXT,
  error_class TEXT,
  redacted_error TEXT CHECK (redacted_error IS NULL OR char_length(redacted_error) <= 1000),
  created_by TEXT,
  updated_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (client_id, id),
  UNIQUE (client_id, id, platform),
  UNIQUE (profile_id, platform, external_destination_id),
  FOREIGN KEY (client_id, profile_id)
    REFERENCES client_measurement_profiles(client_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_conversion_destinations_profile
  ON conversion_destinations (client_id, profile_id, platform, enabled);
CREATE INDEX IF NOT EXISTS idx_conversion_destinations_health
  ON conversion_destinations (health_status, last_success_at, last_failure_at)
  WHERE enabled = TRUE;

CREATE TABLE IF NOT EXISTS conversion_destination_capabilities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  destination_id UUID NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('meta', 'google_data_manager')),
  mode TEXT NOT NULL CHECK (mode IN (
    'meta_pixel',
    'meta_web_capi',
    'meta_crm_capi',
    'meta_conversion_leads',
    'google_tag_enhanced_conversions',
    'google_enhanced_conversions_for_leads',
    'google_data_manager'
  )),
  status TEXT NOT NULL DEFAULT 'not_configured'
    CHECK (status IN ('not_configured', 'detected', 'configured', 'validating', 'ready', 'degraded', 'blocked')),
  management_origin TEXT NOT NULL
    CHECK (management_origin IN ('zero', 'gtm', 'partner', 'external')),
  can_zero_mutate BOOLEAN NOT NULL DEFAULT FALSE,
  evidence_at TIMESTAMPTZ,
  blocking_reason TEXT CHECK (blocking_reason IS NULL OR char_length(blocking_reason) <= 1000),
  config_version INTEGER NOT NULL DEFAULT 1 CHECK (config_version > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (client_id, id),
  UNIQUE (destination_id, mode),
  FOREIGN KEY (client_id, destination_id, platform)
    REFERENCES conversion_destinations(client_id, id, platform) ON DELETE CASCADE,
  CHECK (
    (platform = 'meta' AND mode LIKE 'meta\_%' ESCAPE '\')
    OR (platform = 'google_data_manager' AND mode LIKE 'google\_%' ESCAPE '\')
  ),
  CHECK (management_origin = 'zero' OR can_zero_mutate = FALSE),
  CHECK (status NOT IN ('ready', 'degraded') OR evidence_at IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_conversion_destination_capabilities_health
  ON conversion_destination_capabilities (client_id, status, evidence_at DESC);

CREATE TABLE IF NOT EXISTS conversion_event_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  destination_id UUID NOT NULL,
  canonical_event_name TEXT NOT NULL CHECK (canonical_event_name IN (
    'lead_created', 'lead_contacted', 'lead_qualified', 'lead_won',
    'lead_lost', 'purchase', 'web_conversion'
  )),
  provider_event_name TEXT NOT NULL CHECK (char_length(provider_event_name) BETWEEN 1 AND 255),
  is_active BOOLEAN NOT NULL DEFAULT FALSE,
  config_version INTEGER NOT NULL DEFAULT 1 CHECK (config_version > 0),
  created_by TEXT,
  updated_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (client_id, id),
  FOREIGN KEY (client_id, destination_id)
    REFERENCES conversion_destinations(client_id, id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_conversion_event_mappings_one_active
  ON conversion_event_mappings (destination_id, canonical_event_name)
  WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_conversion_event_mappings_client
  ON conversion_event_mappings (client_id, destination_id, canonical_event_name);

CREATE TABLE IF NOT EXISTS lead_crm_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL,
  person_id UUID,
  opportunity_id UUID,
  link_method TEXT NOT NULL CHECK (link_method IN (
    'promotion', 'source_id', 'platform_id', 'click_id', 'consented_contact', 'manual'
  )),
  source_system TEXT NOT NULL CHECK (char_length(source_system) BETWEEN 1 AND 100),
  source_reference TEXT CHECK (source_reference IS NULL OR char_length(source_reference) <= 255),
  linked_by TEXT,
  linked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (client_id, lead_id),
  FOREIGN KEY (client_id, lead_id)
    REFERENCES leads(client_id, id) ON DELETE CASCADE,
  FOREIGN KEY (client_id, person_id)
    REFERENCES crm_people(client_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (client_id, opportunity_id)
    REFERENCES crm_opportunities(client_id, id) ON DELETE RESTRICT,
  CHECK (person_id IS NOT NULL OR opportunity_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_lead_crm_links_opportunity
  ON lead_crm_links (client_id, opportunity_id)
  WHERE opportunity_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_lead_crm_links_person
  ON lead_crm_links (client_id, person_id)
  WHERE person_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS lead_status_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  lead_id UUID,
  opportunity_id UUID,
  from_status TEXT,
  to_status TEXT NOT NULL CHECK (char_length(to_status) BETWEEN 1 AND 100),
  canonical_event_name TEXT CHECK (canonical_event_name IS NULL OR canonical_event_name IN (
    'lead_created', 'lead_contacted', 'lead_qualified', 'lead_won', 'lead_lost'
  )),
  authority_mode TEXT NOT NULL CHECK (authority_mode IN (
    'zero_native', 'client_webhook', 'connector_sync', 'manual_import'
  )),
  authority_decision TEXT NOT NULL CHECK (authority_decision IN (
    'accepted', 'rejected', 'proposed', 'duplicate'
  )),
  source_system TEXT NOT NULL CHECK (char_length(source_system) BETWEEN 1 AND 100),
  source_event_id TEXT NOT NULL CHECK (char_length(source_event_id) BETWEEN 1 AND 255),
  occurred_at TIMESTAMPTZ NOT NULL,
  actor_type TEXT NOT NULL CHECK (actor_type IN ('team_member', 'client_user', 'system', 'webhook', 'import')),
  actor_id TEXT,
  reason TEXT CHECK (reason IS NULL OR char_length(reason) <= 1000),
  decision_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (client_id, source_system, source_event_id),
  FOREIGN KEY (client_id, lead_id)
    REFERENCES leads(client_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (client_id, opportunity_id)
    REFERENCES crm_opportunities(client_id, id) ON DELETE RESTRICT,
  CHECK (lead_id IS NOT NULL OR opportunity_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_lead_status_events_lead_time
  ON lead_status_events (client_id, lead_id, occurred_at DESC)
  WHERE lead_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_lead_status_events_opportunity_time
  ON lead_status_events (client_id, opportunity_id, occurred_at DESC)
  WHERE opportunity_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_lead_status_events_retention
  ON lead_status_events (created_at);

CREATE TABLE IF NOT EXISTS outcome_endpoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL,
  endpoint_key TEXT NOT NULL UNIQUE CHECK (char_length(endpoint_key) BETWEEN 32 AND 128),
  label TEXT NOT NULL CHECK (char_length(label) BETWEEN 1 AND 100),
  source_system TEXT NOT NULL CHECK (char_length(source_system) BETWEEN 1 AND 100),
  current_secret_ref TEXT NOT NULL CHECK (
    current_secret_ref ~ '^[a-zA-Z0-9][a-zA-Z0-9/_:.-]{0,254}$'
  ),
  previous_secret_ref TEXT CHECK (
    previous_secret_ref IS NULL OR previous_secret_ref ~ '^[a-zA-Z0-9][a-zA-Z0-9/_:.-]{0,254}$'
  ),
  secret_version INTEGER NOT NULL DEFAULT 1 CHECK (secret_version > 0),
  previous_secret_valid_until TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'disabled' CHECK (status IN ('disabled', 'test', 'live', 'paused')),
  replay_window_seconds INTEGER NOT NULL DEFAULT 300
    CHECK (replay_window_seconds BETWEEN 60 AND 900),
  rate_limit_per_minute INTEGER NOT NULL DEFAULT 60
    CHECK (rate_limit_per_minute BETWEEN 1 AND 1000),
  config_version INTEGER NOT NULL DEFAULT 1 CHECK (config_version > 0),
  last_received_at TIMESTAMPTZ,
  created_by TEXT,
  updated_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (client_id, id),
  UNIQUE (client_id, source_system, label),
  FOREIGN KEY (client_id, profile_id)
    REFERENCES client_measurement_profiles(client_id, id) ON DELETE CASCADE,
  CHECK ((previous_secret_ref IS NULL) = (previous_secret_valid_until IS NULL))
);

CREATE INDEX IF NOT EXISTS idx_outcome_endpoints_client_status
  ON outcome_endpoints (client_id, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS conversion_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL,
  event_name TEXT NOT NULL CHECK (event_name IN (
    'lead_created', 'lead_contacted', 'lead_qualified', 'lead_won',
    'lead_lost', 'purchase', 'web_conversion'
  )),
  source_system TEXT NOT NULL CHECK (source_system IN (
    'browser', 'zero_lead', 'zero_crm', 'client_webhook', 'connector_sync', 'manual_import'
  )),
  source_entity_type TEXT NOT NULL CHECK (source_entity_type IN (
    'tracking_event', 'lead', 'crm_opportunity', 'external_lead'
  )),
  source_entity_id TEXT NOT NULL CHECK (char_length(source_entity_id) BETWEEN 1 AND 255),
  source_event_id TEXT NOT NULL CHECK (char_length(source_event_id) BETWEEN 1 AND 255),
  occurred_at TIMESTAMPTZ NOT NULL,
  idempotency_key TEXT NOT NULL CHECK (char_length(idempotency_key) BETWEEN 1 AND 512),
  config_version INTEGER NOT NULL CHECK (config_version > 0),
  consent_mode TEXT NOT NULL CHECK (consent_mode IN ('off', 'au_optout', 'consent_gated')),
  attribution JSONB NOT NULL DEFAULT '{}'::jsonb,
  outbox_status TEXT NOT NULL DEFAULT 'paused' CHECK (outbox_status IN (
    'paused', 'pending', 'claimed', 'published', 'policy_skipped', 'failed'
  )),
  available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  claimed_at TIMESTAMPTZ,
  claimed_by TEXT,
  published_at TIMESTAMPTZ,
  last_error_class TEXT,
  retention_expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '395 days'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (client_id, id),
  UNIQUE (client_id, idempotency_key),
  UNIQUE (client_id, source_system, source_event_id),
  FOREIGN KEY (client_id, profile_id)
    REFERENCES client_measurement_profiles(client_id, id) ON DELETE RESTRICT,
  CHECK (jsonb_typeof(attribution) = 'object'),
  CHECK (NOT (attribution ?| ARRAY['email', 'phone', 'first_name', 'last_name', 'full_name'])),
  CHECK (attribution - ARRAY['browserEventId', 'metaLeadId', 'gclid', 'gbraid', 'wbraid'] = '{}'::jsonb),
  CHECK (retention_expires_at > created_at)
);

CREATE INDEX IF NOT EXISTS idx_conversion_events_pending
  ON conversion_events (available_at, created_at)
  WHERE outbox_status = 'pending';
CREATE INDEX IF NOT EXISTS idx_conversion_events_client_time
  ON conversion_events (client_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversion_events_retention
  ON conversion_events (retention_expires_at);

CREATE TABLE IF NOT EXISTS conversion_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  event_id UUID NOT NULL,
  destination_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'claimed', 'accepted', 'delivered', 'retryable',
    'permanent_failure', 'policy_skipped', 'cancelled'
  )),
  config_version INTEGER NOT NULL CHECK (config_version > 0),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  next_attempt_at TIMESTAMPTZ,
  claimed_at TIMESTAMPTZ,
  claimed_by TEXT,
  last_attempt_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  provider_request_id TEXT,
  error_class TEXT,
  redacted_error TEXT CHECK (redacted_error IS NULL OR char_length(redacted_error) <= 1000),
  retention_expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '395 days'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (client_id, id),
  UNIQUE (event_id, destination_id),
  FOREIGN KEY (client_id, event_id)
    REFERENCES conversion_events(client_id, id) ON DELETE CASCADE,
  FOREIGN KEY (client_id, destination_id)
    REFERENCES conversion_destinations(client_id, id) ON DELETE RESTRICT,
  CHECK (retention_expires_at > created_at)
);

CREATE INDEX IF NOT EXISTS idx_conversion_deliveries_pending
  ON conversion_deliveries (next_attempt_at, created_at)
  WHERE status IN ('pending', 'retryable');
CREATE INDEX IF NOT EXISTS idx_conversion_deliveries_client_health
  ON conversion_deliveries (client_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversion_deliveries_retention
  ON conversion_deliveries (retention_expires_at);

CREATE TABLE IF NOT EXISTS conversion_delivery_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  delivery_id UUID NOT NULL,
  attempt_number INTEGER NOT NULL CHECK (attempt_number > 0),
  outcome TEXT NOT NULL CHECK (outcome IN (
    'accepted', 'delivered', 'retryable', 'permanent_failure', 'policy_skipped'
  )),
  provider_request_id TEXT,
  error_class TEXT,
  redacted_diagnostic TEXT CHECK (
    redacted_diagnostic IS NULL OR char_length(redacted_diagnostic) <= 1000
  ),
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  duration_ms INTEGER CHECK (duration_ms IS NULL OR duration_ms >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (delivery_id, attempt_number),
  FOREIGN KEY (client_id, delivery_id)
    REFERENCES conversion_deliveries(client_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_conversion_delivery_attempts_delivery
  ON conversion_delivery_attempts (client_id, delivery_id, attempt_number DESC);
CREATE INDEX IF NOT EXISTS idx_conversion_delivery_attempts_retention
  ON conversion_delivery_attempts (created_at);

CREATE OR REPLACE FUNCTION prevent_measurement_append_only_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION '% is append-only; insert a correcting event instead', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_measurement_config_audit_append_only
  ON measurement_config_audit;
CREATE TRIGGER trg_measurement_config_audit_append_only
BEFORE UPDATE OR DELETE ON measurement_config_audit
FOR EACH ROW EXECUTE FUNCTION prevent_measurement_append_only_mutation();

DROP TRIGGER IF EXISTS trg_lead_status_events_append_only
  ON lead_status_events;
CREATE TRIGGER trg_lead_status_events_append_only
BEFORE UPDATE OR DELETE ON lead_status_events
FOR EACH ROW EXECUTE FUNCTION prevent_measurement_append_only_mutation();

DROP TRIGGER IF EXISTS trg_conversion_delivery_attempts_append_only
  ON conversion_delivery_attempts;
CREATE TRIGGER trg_conversion_delivery_attempts_append_only
BEFORE UPDATE OR DELETE ON conversion_delivery_attempts
FOR EACH ROW EXECUTE FUNCTION prevent_measurement_append_only_mutation();

DROP TRIGGER IF EXISTS trg_client_measurement_profiles_updated_at
  ON client_measurement_profiles;
CREATE TRIGGER trg_client_measurement_profiles_updated_at
BEFORE UPDATE ON client_measurement_profiles
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_conversion_destinations_updated_at
  ON conversion_destinations;
CREATE TRIGGER trg_conversion_destinations_updated_at
BEFORE UPDATE ON conversion_destinations
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_conversion_destination_capabilities_updated_at
  ON conversion_destination_capabilities;
CREATE TRIGGER trg_conversion_destination_capabilities_updated_at
BEFORE UPDATE ON conversion_destination_capabilities
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_conversion_event_mappings_updated_at
  ON conversion_event_mappings;
CREATE TRIGGER trg_conversion_event_mappings_updated_at
BEFORE UPDATE ON conversion_event_mappings
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_outcome_endpoints_updated_at
  ON outcome_endpoints;
CREATE TRIGGER trg_outcome_endpoints_updated_at
BEFORE UPDATE ON outcome_endpoints
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_conversion_deliveries_updated_at
  ON conversion_deliveries;
CREATE TRIGGER trg_conversion_deliveries_updated_at
BEFORE UPDATE ON conversion_deliveries
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Existing clients receive only a disabled canonical profile. Connected accounts,
-- tracking sites and provider console state are deliberately not inferred.
INSERT INTO client_measurement_profiles (client_id, vertical)
SELECT
  id,
  COALESCE(NULLIF(TRIM(industry), ''), 'general')
FROM agency_clients
ON CONFLICT (client_id) DO NOTHING;

COMMENT ON TABLE client_measurement_profiles IS
  'Zero canonical client measurement configuration; all seeded profiles are dormant.';
COMMENT ON TABLE measurement_config_audit IS
  'Append-only, secret-free configuration change evidence.';
COMMENT ON TABLE conversion_events IS
  'Canonical tenant-scoped conversion outbox; provider-neutral and PII-minimised.';
COMMENT ON TABLE conversion_delivery_attempts IS
  'Append-only redacted provider attempt evidence; no request or response payloads.';

COMMIT;
