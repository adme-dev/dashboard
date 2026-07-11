-- Version-locked role KPIs and verified participant observations.

CREATE TABLE IF NOT EXISTS hr_role_kpi_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role_profile_version_id UUID NOT NULL
    REFERENCES hr_role_profile_versions(id) ON DELETE CASCADE,
  kpi_key TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  unit TEXT NOT NULL,
  direction TEXT NOT NULL
    CHECK (direction IN ('higher_is_better', 'lower_is_better', 'within_range', 'milestone')),
  target_value NUMERIC,
  target_min NUMERIC,
  target_max NUMERIC,
  target_description TEXT,
  cadence TEXT NOT NULL
    CHECK (cadence IN ('weekly', 'monthly', 'quarterly', 'per_project', 'annual')),
  source_type TEXT NOT NULL
    CHECK (source_type IN ('platform', 'monday', 'approved_report', 'manual_verified', 'other')),
  source_ref TEXT,
  data_owner TEXT,
  weight NUMERIC(5,2) NOT NULL CHECK (weight > 0 AND weight <= 100),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('draft', 'active', 'retired')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (role_profile_version_id, kpi_key),
  CHECK (target_min IS NULL OR target_max IS NULL OR target_max >= target_min)
);

CREATE INDEX IF NOT EXISTS idx_hr_role_kpi_version
  ON hr_role_kpi_definitions(role_profile_version_id, status);

CREATE TABLE IF NOT EXISTS hr_kpi_observations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_id UUID NOT NULL REFERENCES hr_review_participants(id) ON DELETE CASCADE,
  kpi_definition_id UUID NOT NULL REFERENCES hr_role_kpi_definitions(id) ON DELETE RESTRICT,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  actual_value NUMERIC,
  actual_text TEXT,
  target_snapshot JSONB NOT NULL,
  source_ref TEXT NOT NULL,
  evidence_status TEXT NOT NULL DEFAULT 'unverified'
    CHECK (evidence_status IN ('unverified', 'verified', 'disputed', 'missing')),
  context_note TEXT,
  recorded_by UUID REFERENCES team_members(id) ON DELETE SET NULL,
  verified_by UUID REFERENCES team_members(id) ON DELETE SET NULL,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (period_end >= period_start),
  CHECK (actual_value IS NOT NULL OR actual_text IS NOT NULL),
  UNIQUE (participant_id, kpi_definition_id, period_start, period_end)
);

CREATE INDEX IF NOT EXISTS idx_hr_kpi_observation_participant
  ON hr_kpi_observations(participant_id, evidence_status, period_end DESC);

COMMENT ON TABLE hr_role_kpi_definitions IS
  'Owner-approved KPI definitions locked to a role version; employee questionnaire opinion is never the KPI source.';
COMMENT ON TABLE hr_kpi_observations IS
  'Challengeable KPI evidence with target snapshot, source provenance and human verification.';
