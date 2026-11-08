-- Operator reconciliation of TERMINAL historical generation jobs whose liability is
-- 'uncertain' (for example rows backfilled by 506 from before submission claims).
-- Live jobs settle only through the worker/finalizer; this table never replaces them.
--
-- Every settlement is append-only evidence: who, which exact job/tenant/project, the
-- expected prior liability (CAS), the outcome, and a provider-proof reference. A job can
-- be reconciled at most once; a mistaken entry is corrected by a reviewed migration, not
-- by editing evidence. No cost is ever inferred: 'reported' requires an explicit actual
-- cost; 'released' asserts the provider proves no charge.

BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS video_generation_liability_reconciliations (
  id UUID PRIMARY KEY,
  operation_id TEXT NOT NULL UNIQUE CHECK (length(operation_id) BETWEEN 8 AND 200),
  job_id UUID NOT NULL UNIQUE REFERENCES video_generation_jobs(id) ON DELETE RESTRICT,
  tenant_id TEXT NOT NULL,
  project_id UUID NOT NULL,
  expected_liability_state TEXT NOT NULL CHECK (expected_liability_state = 'uncertain'),
  expected_liability_cents INTEGER NOT NULL CHECK (expected_liability_cents >= 0),
  outcome TEXT NOT NULL CHECK (outcome IN ('reported', 'released')),
  actual_cost_cents INTEGER NULL CHECK (actual_cost_cents IS NULL OR actual_cost_cents >= 0),
  evidence_kind TEXT NOT NULL CHECK (evidence_kind IN ('provider_log', 'provider_invoice', 'provider_support_case')),
  evidence_reference TEXT NOT NULL CHECK (length(evidence_reference) BETWEEN 8 AND 512),
  evidence_sha256 TEXT NULL CHECK (evidence_sha256 IS NULL OR evidence_sha256 ~ '^[0-9a-f]{64}$'),
  note TEXT NULL CHECK (note IS NULL OR length(note) <= 1000),
  actor_id UUID NOT NULL,
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
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'video_generation_liability_reconciliation_no_mutation') THEN
    CREATE TRIGGER video_generation_liability_reconciliation_no_mutation
      BEFORE UPDATE OR DELETE ON video_generation_liability_reconciliations
      FOR EACH ROW EXECUTE FUNCTION video_generation_liability_reconciliation_immutable();
  END IF;
END $$;

COMMIT;
