-- Operator reconciliation of TERMINAL historical generation jobs whose liability is
-- 'uncertain' (for example rows backfilled by 506 from before submission claims).
-- Live jobs settle only through the worker/finalizer; this table never replaces them.
--
-- Every settlement is append-only evidence: the attested owner, the database role and
-- application that actually executed it, the exact job/tenant/project, the expected
-- prior liability (CAS), the outcome, and a provider-evidence reference plus the
-- SHA-256 of the retained provider artifact (log export, invoice, support reply).
-- The database cannot verify provider truth offline: this records an accountable,
-- reviewable operator attestation, never an inferred cost. A job reconciles once;
-- a mistaken entry is corrected by a reviewed migration, not by editing evidence.

BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS video_generation_liability_reconciliations (
  id UUID PRIMARY KEY,
  operation_id TEXT NOT NULL UNIQUE CHECK (length(operation_id) BETWEEN 8 AND 200 AND operation_id = btrim(operation_id)),
  job_id UUID NOT NULL UNIQUE REFERENCES video_generation_jobs(id) ON DELETE RESTRICT,
  tenant_id TEXT NOT NULL,
  project_id UUID NOT NULL,
  expected_liability_state TEXT NOT NULL CHECK (expected_liability_state = 'uncertain'),
  expected_liability_cents INTEGER NOT NULL CHECK (expected_liability_cents >= 0),
  outcome TEXT NOT NULL CHECK (outcome IN ('reported', 'released')),
  actual_cost_cents INTEGER NULL CHECK (actual_cost_cents IS NULL OR actual_cost_cents >= 0),
  evidence_kind TEXT NOT NULL CHECK (evidence_kind IN ('provider_log', 'provider_invoice', 'provider_support_case')),
  evidence_reference TEXT NOT NULL CHECK (length(evidence_reference) BETWEEN 8 AND 512 AND evidence_reference = btrim(evidence_reference)),
  evidence_sha256 TEXT NOT NULL CHECK (evidence_sha256 ~ '^[0-9a-f]{64}$'),
  note TEXT NULL CHECK (note IS NULL OR length(note) <= 1000),
  actor_id UUID NOT NULL,
  executed_by_role TEXT NOT NULL DEFAULT current_user,
  executed_by_application TEXT NULL DEFAULT current_setting('application_name', true),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT video_generation_liability_reconciliation_outcome_cost
    CHECK ((outcome = 'reported') = (actual_cost_cents IS NOT NULL))
);

CREATE OR REPLACE FUNCTION video_generation_liability_reconciliation_immutable() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Video generation liability reconciliation evidence is immutable';
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgrelid = 'video_generation_liability_reconciliations'::regclass
       AND tgname = 'video_generation_liability_reconciliation_no_mutation'
  ) THEN
    CREATE TRIGGER video_generation_liability_reconciliation_no_mutation
      BEFORE UPDATE OR DELETE ON video_generation_liability_reconciliations
      FOR EACH ROW EXECUTE FUNCTION video_generation_liability_reconciliation_immutable();
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgrelid = 'video_generation_liability_reconciliations'::regclass
       AND tgname = 'video_generation_liability_reconciliation_no_truncate'
  ) THEN
    CREATE TRIGGER video_generation_liability_reconciliation_no_truncate
      BEFORE TRUNCATE ON video_generation_liability_reconciliations
      FOR EACH STATEMENT EXECUTE FUNCTION video_generation_liability_reconciliation_immutable();
  END IF;
END $$;

COMMIT;
