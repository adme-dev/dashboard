BEGIN;

CREATE TABLE IF NOT EXISTS crm_identity_resolution_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  case_type TEXT NOT NULL
    CHECK (case_type IN ('conflict', 'merge', 'split', 'link_review')),
  primary_profile_id UUID,
  secondary_profile_id UUID,
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'in_review', 'approved', 'rejected', 'applied', 'rolled_back')),
  risk_level TEXT NOT NULL DEFAULT 'medium'
    CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
  title TEXT NOT NULL,
  reason TEXT NOT NULL,
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(evidence) = 'object'),
  proposed_by UUID NOT NULL REFERENCES team_members(id) ON DELETE RESTRICT,
  reviewed_by UUID REFERENCES team_members(id) ON DELETE RESTRICT,
  reviewed_at TIMESTAMPTZ,
  applied_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (client_id, id),
  FOREIGN KEY (client_id, primary_profile_id)
    REFERENCES crm_identity_profiles(client_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (client_id, secondary_profile_id)
    REFERENCES crm_identity_profiles(client_id, id) ON DELETE RESTRICT,
  CHECK (primary_profile_id IS NOT NULL OR secondary_profile_id IS NOT NULL),
  CHECK (
    primary_profile_id IS NULL
    OR secondary_profile_id IS NULL
    OR primary_profile_id <> secondary_profile_id
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_crm_identity_resolution_open_pair
  ON crm_identity_resolution_cases (
    client_id,
    case_type,
    primary_profile_id,
    secondary_profile_id
  )
  WHERE status IN ('open', 'in_review', 'approved');

CREATE INDEX IF NOT EXISTS idx_crm_identity_resolution_cases_status
  ON crm_identity_resolution_cases (client_id, status, risk_level, created_at DESC);

CREATE TABLE IF NOT EXISTS crm_identity_resolution_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  case_id UUID NOT NULL,
  version INTEGER NOT NULL CHECK (version > 0),
  operation TEXT NOT NULL CHECK (operation IN ('merge', 'split', 'rollback')),
  reason TEXT NOT NULL,
  created_by UUID NOT NULL REFERENCES team_members(id) ON DELETE RESTRICT,
  effective_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (client_id, case_id, version),
  UNIQUE (client_id, id),
  FOREIGN KEY (client_id, case_id)
    REFERENCES crm_identity_resolution_cases(client_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS crm_identity_resolution_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  resolution_version_id UUID NOT NULL,
  source_profile_id UUID NOT NULL,
  resolved_profile_id UUID NOT NULL,
  subject_type TEXT,
  subject_id TEXT,
  relationship TEXT NOT NULL
    CHECK (relationship IN ('canonical', 'merged', 'split', 'restored')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (
    resolution_version_id,
    source_profile_id,
    resolved_profile_id,
    subject_type,
    subject_id
  ),
  FOREIGN KEY (client_id, resolution_version_id)
    REFERENCES crm_identity_resolution_versions(client_id, id) ON DELETE CASCADE,
  FOREIGN KEY (client_id, source_profile_id)
    REFERENCES crm_identity_profiles(client_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (client_id, resolved_profile_id)
    REFERENCES crm_identity_profiles(client_id, id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_crm_identity_resolution_members_source
  ON crm_identity_resolution_members (client_id, source_profile_id, created_at DESC);

CREATE TABLE IF NOT EXISTS crm_identity_resolution_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  case_id UUID NOT NULL,
  action TEXT NOT NULL
    CHECK (action IN (
      'created', 'review_started', 'approved', 'rejected',
      'applied', 'rolled_back'
    )),
  actor_id UUID NOT NULL REFERENCES team_members(id) ON DELETE RESTRICT,
  reason TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(metadata) = 'object'),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (client_id, case_id)
    REFERENCES crm_identity_resolution_cases(client_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_crm_identity_resolution_audit_case
  ON crm_identity_resolution_audit (client_id, case_id, occurred_at DESC);

DROP TRIGGER IF EXISTS trg_crm_identity_resolution_versions_append_only
  ON crm_identity_resolution_versions;
CREATE TRIGGER trg_crm_identity_resolution_versions_append_only
  BEFORE UPDATE OR DELETE ON crm_identity_resolution_versions
  FOR EACH ROW EXECUTE FUNCTION prevent_measurement_append_only_mutation();

DROP TRIGGER IF EXISTS trg_crm_identity_resolution_members_append_only
  ON crm_identity_resolution_members;
CREATE TRIGGER trg_crm_identity_resolution_members_append_only
  BEFORE UPDATE OR DELETE ON crm_identity_resolution_members
  FOR EACH ROW EXECUTE FUNCTION prevent_measurement_append_only_mutation();

DROP TRIGGER IF EXISTS trg_crm_identity_resolution_audit_append_only
  ON crm_identity_resolution_audit;
CREATE TRIGGER trg_crm_identity_resolution_audit_append_only
  BEFORE UPDATE OR DELETE ON crm_identity_resolution_audit
  FOR EACH ROW EXECUTE FUNCTION prevent_measurement_append_only_mutation();

CREATE OR REPLACE VIEW crm_identity_current_resolution AS
WITH ranked AS (
  SELECT
    member.client_id,
    version.case_id,
    version.id AS resolution_version_id,
    version.version,
    version.operation,
    version.effective_at,
    member.source_profile_id,
    member.resolved_profile_id,
    member.subject_type,
    member.subject_id,
    member.relationship,
    ROW_NUMBER() OVER (
      PARTITION BY
        member.client_id,
        member.source_profile_id,
        COALESCE(member.subject_type, ''),
        COALESCE(member.subject_id, '')
      ORDER BY version.effective_at DESC, version.version DESC, member.created_at DESC
    ) AS resolution_rank
  FROM crm_identity_resolution_members member
  JOIN crm_identity_resolution_versions version
    ON version.client_id = member.client_id
   AND version.id = member.resolution_version_id
)
SELECT
  client_id,
  case_id,
  resolution_version_id,
  version,
  operation,
  effective_at,
  source_profile_id,
  resolved_profile_id,
  subject_type,
  subject_id,
  relationship
FROM ranked
WHERE resolution_rank = 1;

COMMIT;
