BEGIN;

CREATE TABLE IF NOT EXISTS crm_customer_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  profile_id UUID,
  subject_hash TEXT NOT NULL,
  source_type TEXT NOT NULL CHECK (source_type IN ('tracking', 'lead', 'crm', 'inventory')),
  source_id TEXT NOT NULL,
  signal_class TEXT NOT NULL CHECK (signal_class IN ('behaviour', 'intent', 'conversion', 'lifecycle')),
  signal_key TEXT NOT NULL,
  signal_value TEXT,
  product_id UUID,
  confidence NUMERIC(5, 4) NOT NULL DEFAULT 1 CHECK (confidence >= 0 AND confidence <= 1),
  consent_marketing TEXT NOT NULL DEFAULT 'unknown'
    CHECK (consent_marketing IN ('granted', 'denied', 'unknown')),
  context JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT crm_customer_signals_profile_fk
    FOREIGN KEY (client_id, profile_id)
    REFERENCES crm_identity_profiles(client_id, id)
    ON DELETE SET NULL (profile_id),
  CONSTRAINT crm_customer_signals_product_fk
    FOREIGN KEY (client_id, product_id)
    REFERENCES crm_products(client_id, id)
    ON DELETE SET NULL (product_id),
  CONSTRAINT crm_customer_signals_source_unique
    UNIQUE (client_id, source_type, source_id, signal_key)
);

CREATE INDEX IF NOT EXISTS idx_crm_customer_signals_subject_time
  ON crm_customer_signals (client_id, subject_hash, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_customer_signals_profile_time
  ON crm_customer_signals (client_id, profile_id, occurred_at DESC)
  WHERE profile_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_crm_customer_signals_key_time
  ON crm_customer_signals (client_id, signal_key, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_customer_signals_product_time
  ON crm_customer_signals (client_id, product_id, occurred_at DESC)
  WHERE product_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS crm_consent_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  profile_id UUID,
  subject_hash TEXT NOT NULL,
  snapshot_hash TEXT NOT NULL,
  tracking TEXT NOT NULL CHECK (tracking IN ('granted', 'denied', 'unknown')),
  analytics TEXT NOT NULL CHECK (analytics IN ('granted', 'denied', 'unknown')),
  marketing TEXT NOT NULL CHECK (marketing IN ('granted', 'denied', 'unknown')),
  consent_source TEXT NOT NULL,
  region TEXT,
  source_event_id TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT crm_consent_history_profile_fk
    FOREIGN KEY (client_id, profile_id)
    REFERENCES crm_identity_profiles(client_id, id)
    ON DELETE SET NULL (profile_id),
  CONSTRAINT crm_consent_history_event_unique
    UNIQUE (client_id, subject_hash, snapshot_hash, source_event_id)
);

CREATE INDEX IF NOT EXISTS idx_crm_consent_history_subject_time
  ON crm_consent_history (client_id, subject_hash, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_consent_history_profile_time
  ON crm_consent_history (client_id, profile_id, occurred_at DESC)
  WHERE profile_id IS NOT NULL;

DROP TRIGGER IF EXISTS trg_crm_consent_history_append_only ON crm_consent_history;
CREATE TRIGGER trg_crm_consent_history_append_only
  BEFORE UPDATE OR DELETE ON crm_consent_history
  FOR EACH ROW EXECUTE FUNCTION prevent_measurement_append_only_mutation();

CREATE TABLE IF NOT EXISTS crm_persona_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES agency_clients(id) ON DELETE CASCADE,
  vertical TEXT NOT NULL DEFAULT 'universal',
  persona_key TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  label TEXT NOT NULL,
  description TEXT NOT NULL,
  positive_signals JSONB NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(positive_signals) = 'array'),
  negative_signals JSONB NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(negative_signals) = 'array'),
  min_confidence NUMERIC(5, 4) NOT NULL DEFAULT 0.5
    CHECK (min_confidence > 0 AND min_confidence <= 1),
  allowed_channels TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  targeting_allowed BOOLEAN NOT NULL DEFAULT FALSE,
  reporting_allowed BOOLEAN NOT NULL DEFAULT TRUE,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'retired')),
  created_by UUID REFERENCES team_members(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_crm_persona_definitions_system
  ON crm_persona_definitions (vertical, persona_key, version)
  WHERE client_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_crm_persona_definitions_client
  ON crm_persona_definitions (client_id, vertical, persona_key, version)
  WHERE client_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_crm_persona_definitions_active
  ON crm_persona_definitions (client_id, vertical, persona_key, version DESC)
  WHERE status = 'active';

CREATE TABLE IF NOT EXISTS crm_audience_cohort_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  scope_hash TEXT NOT NULL,
  filters JSONB NOT NULL DEFAULT '{}'::jsonb,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  generated_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (client_id, scope_hash)
);

CREATE INDEX IF NOT EXISTS idx_crm_audience_cohort_snapshots_expiry
  ON crm_audience_cohort_snapshots (client_id, expires_at DESC);

INSERT INTO crm_persona_definitions (
  client_id, vertical, persona_key, version, label, description,
  positive_signals, negative_signals, min_confidence, allowed_channels,
  targeting_allowed, reporting_allowed, status
)
SELECT
  NULL,
  seed.vertical,
  seed.persona_key,
  1,
  seed.label,
  seed.description,
  seed.positive_signals::jsonb,
  seed.negative_signals::jsonb,
  seed.min_confidence,
  ARRAY['google', 'meta']::TEXT[],
  TRUE,
  TRUE,
  'active'
FROM (
  VALUES
    (
      'automotive',
      'active_vehicle_shopper',
      'Active vehicle shopper',
      'Repeatedly explores inventory, vehicle detail pages, search or filters.',
      '["vehicle_view","vehicle_list_view","search","filter_change","return_to_vehicle"]',
      '[]',
      0.40::numeric
    ),
    (
      'automotive',
      'finance_ready',
      'Finance-ready shopper',
      'Shows finance, trade-in, test-drive or confirmed lead intent.',
      '["finance_calculator_interact","trade_in_start","trade_in_complete","test_drive_booking","generate_lead","lead_created"]',
      '["form_abandonment"]',
      0.34::numeric
    ),
    (
      'automotive',
      'returning_high_intent',
      'Returning high-intent shopper',
      'Combines repeat consideration with form, wishlist or conversion activity.',
      '["return_to_vehicle","add_to_wishlist","form_start","form_submit","generate_lead","lead_created"]',
      '["form_abandonment"]',
      0.40::numeric
    )
) AS seed(
  vertical, persona_key, label, description,
  positive_signals, negative_signals, min_confidence
)
WHERE NOT EXISTS (
  SELECT 1
  FROM crm_persona_definitions existing
  WHERE existing.client_id IS NULL
    AND existing.vertical = seed.vertical
    AND existing.persona_key = seed.persona_key
    AND existing.version = 1
);

COMMIT;
