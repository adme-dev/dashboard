-- 260_measurement_lifecycle_mappings.sql
-- Explicit per-client lead-status / CRM-stage mappings into canonical outcomes.
-- No labels are inferred and new mappings are dormant until explicitly enabled.

BEGIN;

CREATE TABLE IF NOT EXISTS measurement_lifecycle_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL,
  source_type TEXT NOT NULL CHECK (source_type IN ('lead_status', 'crm_stage')),
  source_value TEXT NOT NULL CHECK (char_length(source_value) BETWEEN 1 AND 255),
  canonical_event_name TEXT NOT NULL CHECK (canonical_event_name IN (
    'lead_created', 'lead_contacted', 'lead_qualified', 'lead_won', 'lead_lost'
  )),
  is_active BOOLEAN NOT NULL DEFAULT FALSE,
  config_version INTEGER NOT NULL CHECK (config_version > 0),
  created_by TEXT,
  updated_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (client_id, id),
  FOREIGN KEY (client_id, profile_id)
    REFERENCES client_measurement_profiles(client_id, id) ON DELETE CASCADE,
  CHECK (
    (
      source_type = 'lead_status'
      AND source_value IN ('new', 'contacted', 'qualified', 'won', 'lost')
    )
    OR (
      source_type = 'crm_stage'
      AND source_value ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    )
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_measurement_lifecycle_mappings_one_active
  ON measurement_lifecycle_mappings (client_id, source_type, source_value)
  WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_measurement_lifecycle_mappings_profile
  ON measurement_lifecycle_mappings (client_id, profile_id, source_type, is_active);

ALTER TABLE measurement_config_audit
  DROP CONSTRAINT IF EXISTS measurement_config_audit_entity_type_check;
ALTER TABLE measurement_config_audit
  ADD CONSTRAINT measurement_config_audit_entity_type_check
  CHECK (entity_type IN (
    'profile', 'destination', 'capability', 'mapping', 'outcome_endpoint',
    'lifecycle_mapping'
  ));

COMMENT ON TABLE measurement_lifecycle_mappings IS
  'Canonical per-client lifecycle source mappings; source labels are never inferred and changes are versioned through the Measurement profile.';

COMMIT;
