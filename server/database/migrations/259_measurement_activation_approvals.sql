-- 259_measurement_activation_approvals.sql
-- Immutable, version-bound approvals for governed Measurement live activation.

BEGIN;

CREATE TABLE IF NOT EXISTS measurement_activation_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL,
  config_version INTEGER NOT NULL CHECK (config_version > 0),
  approval_kind TEXT NOT NULL CHECK (approval_kind IN ('privacy', 'live')),
  approved_by UUID NOT NULL REFERENCES team_members(id) ON DELETE RESTRICT,
  reason TEXT NOT NULL CHECK (char_length(reason) BETWEEN 1 AND 1000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (client_id, profile_id)
    REFERENCES client_measurement_profiles(client_id, id) ON DELETE CASCADE,
  UNIQUE (client_id, profile_id, config_version, approval_kind),
  UNIQUE (client_id, profile_id, config_version, approved_by)
);

CREATE INDEX IF NOT EXISTS idx_measurement_activation_approvals_current
  ON measurement_activation_approvals (client_id, profile_id, config_version, created_at DESC);

DROP TRIGGER IF EXISTS trg_measurement_activation_approvals_append_only
  ON measurement_activation_approvals;
CREATE TRIGGER trg_measurement_activation_approvals_append_only
  BEFORE UPDATE OR DELETE ON measurement_activation_approvals
  FOR EACH ROW EXECUTE FUNCTION prevent_measurement_append_only_mutation();

ALTER TABLE measurement_config_audit
  DROP CONSTRAINT IF EXISTS measurement_config_audit_action_check;
ALTER TABLE measurement_config_audit
  ADD CONSTRAINT measurement_config_audit_action_check
  CHECK (action IN (
    'created', 'updated', 'enabled', 'disabled', 'paused', 'validated',
    'approved', 'activated'
  ));

COMMENT ON TABLE measurement_activation_approvals IS
  'Append-only privacy/live approvals bound to one canonical Measurement profile version; distinct approvers are enforced.';

COMMIT;
