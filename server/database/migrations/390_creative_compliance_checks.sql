-- 390_creative_compliance_checks.sql
-- Append-only evidence for Qwen vision pre-flight checks. A check is inserted only
-- after the provider returns a complete structured verdict; corrections are new rows.

BEGIN;

CREATE TABLE IF NOT EXISTS creative_compliance_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NULL REFERENCES agency_clients(id) ON DELETE SET NULL,
  asset_id UUID NOT NULL REFERENCES banner_assets(id) ON DELETE RESTRICT,
  created_by UUID NOT NULL REFERENCES team_members(id) ON DELETE RESTRICT,
  model_id TEXT NOT NULL,
  gateway_used BOOLEAN NOT NULL DEFAULT true,
  subject_type TEXT NOT NULL CHECK (subject_type IN ('vehicle', 'non_vehicle')),
  reference_source_asset_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  expected_claims JSONB NOT NULL DEFAULT '{}'::jsonb,
  verdict JSONB NOT NULL,
  passed BOOLEAN NOT NULL,
  confidence NUMERIC(4,3) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (jsonb_typeof(reference_source_asset_ids) = 'array'),
  CHECK (jsonb_array_length(reference_source_asset_ids) <= 4),
  CHECK (jsonb_typeof(expected_claims) = 'object'),
  CHECK (jsonb_typeof(verdict) = 'object'),
  CHECK (octet_length(expected_claims::TEXT) <= 8192),
  CHECK (octet_length(verdict::TEXT) <= 16384)
);

CREATE INDEX IF NOT EXISTS creative_compliance_checks_asset_created_idx
  ON creative_compliance_checks (asset_id, created_at DESC);
CREATE INDEX IF NOT EXISTS creative_compliance_checks_client_failed_idx
  ON creative_compliance_checks (client_id, created_at DESC)
  WHERE passed = false;

CREATE OR REPLACE FUNCTION reject_creative_compliance_check_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'creative compliance evidence is append-only';
END;
$$;

DROP TRIGGER IF EXISTS trg_reject_creative_compliance_check_update ON creative_compliance_checks;
CREATE TRIGGER trg_reject_creative_compliance_check_update
  BEFORE UPDATE ON creative_compliance_checks
  FOR EACH ROW EXECUTE FUNCTION reject_creative_compliance_check_mutation();

DROP TRIGGER IF EXISTS trg_reject_creative_compliance_check_delete ON creative_compliance_checks;
CREATE TRIGGER trg_reject_creative_compliance_check_delete
  BEFORE DELETE ON creative_compliance_checks
  FOR EACH ROW EXECUTE FUNCTION reject_creative_compliance_check_mutation();

COMMIT;
