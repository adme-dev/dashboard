-- Storyboard production attempts reference canonical generation liabilities; no spend balance.
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS video_storyboard_production_allowances (
  project_id UUID PRIMARY KEY REFERENCES media_projects(id) ON DELETE RESTRICT,
  currency TEXT NOT NULL DEFAULT 'USD' CHECK (currency = 'USD'),
  allowance_cents INTEGER NOT NULL CHECK (allowance_cents >= 0),
  updated_by UUID NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS video_storyboard_production_allowance_audits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES media_projects(id) ON DELETE RESTRICT,
  previous_allowance_cents INTEGER CHECK (previous_allowance_cents IS NULL OR previous_allowance_cents >= 0),
  allowance_cents INTEGER NOT NULL CHECK (allowance_cents >= 0),
  actor_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_storyboard_production_allowance_audits_project
  ON video_storyboard_production_allowance_audits (project_id, created_at DESC);

CREATE TABLE IF NOT EXISTS video_storyboard_shot_attempts (
  id UUID PRIMARY KEY,
  job_id UUID NOT NULL UNIQUE REFERENCES video_generation_jobs(id) ON DELETE RESTRICT,
  project_id UUID NOT NULL REFERENCES media_projects(id) ON DELETE RESTRICT,
  shot_id UUID NOT NULL,
  storyboard_revision_id UUID NOT NULL,
  reference_set_id UUID NOT NULL,
  plan_hash TEXT NOT NULL CHECK (plan_hash ~ '^[a-f0-9]{64}$'),
  copy_hash TEXT NOT NULL CHECK (copy_hash ~ '^[a-f0-9]{64}$'),
  source_hash TEXT NOT NULL CHECK (source_hash ~ '^[a-f0-9]{64}$'),
  reference_content_hash TEXT NOT NULL CHECK (reference_content_hash ~ '^[a-f0-9]{64}$'),
  shot_hash TEXT NOT NULL CHECK (shot_hash ~ '^[a-f0-9]{64}$'),
  operation_id UUID NOT NULL,
  request_hash TEXT NOT NULL CHECK (request_hash ~ '^[a-f0-9]{64}$'),
  request_fingerprint TEXT NOT NULL CHECK (request_fingerprint ~ '^[a-f0-9]{64}$'),
  request_snapshot JSONB NOT NULL CHECK (
    jsonb_typeof(request_snapshot) = 'object' AND octet_length(request_snapshot::TEXT) <= 131072
  ),
  model_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  provider_model_revision TEXT,
  actual_seed TEXT,
  recipe_id TEXT,
  recipe_version INTEGER CHECK (recipe_version IS NULL OR recipe_version > 0),
  currency TEXT NOT NULL DEFAULT 'USD' CHECK (currency = 'USD'),
  estimated_cents INTEGER NOT NULL CHECK (estimated_cents >= 0),
  execution_state TEXT NOT NULL CHECK (
    execution_state IN ('queued','running','unknown','ready','failed','cancelled')
  ),
  review_state TEXT NOT NULL CHECK (
    review_state IN ('unreviewed','approved','rejected','stale')
  ),
  artifact_sha256 TEXT CHECK (artifact_sha256 IS NULL OR artifact_sha256 ~ '^[a-f0-9]{64}$'),
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ready_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  reviewed_at TIMESTAMPTZ,
  UNIQUE (project_id, id),
  UNIQUE (project_id, operation_id),
  FOREIGN KEY (project_id, storyboard_revision_id)
    REFERENCES video_storyboard_revisions(project_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (project_id, reference_set_id)
    REFERENCES video_storyboard_reference_sets(project_id, id) ON DELETE RESTRICT,
  CHECK ((recipe_id IS NULL) = (recipe_version IS NULL)),
  CHECK (review_state <> 'approved' OR execution_state = 'ready'),
  CHECK (execution_state <> 'cancelled' OR cancelled_at IS NOT NULL),
  CHECK (execution_state <> 'ready' OR ready_at IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_storyboard_shot_attempts_project_shot
  ON video_storyboard_shot_attempts (project_id, shot_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_storyboard_shot_attempts_execution
  ON video_storyboard_shot_attempts (execution_state, updated_at);

CREATE TABLE IF NOT EXISTS video_storyboard_shot_approvals (
  id UUID PRIMARY KEY,
  attempt_id UUID NOT NULL REFERENCES video_storyboard_shot_attempts(id) ON DELETE RESTRICT,
  artifact_role TEXT NOT NULL CHECK (artifact_role = 'final_video'),
  artifact_sha256 TEXT NOT NULL CHECK (artifact_sha256 ~ '^[a-f0-9]{64}$'),
  storyboard_revision_id UUID NOT NULL,
  reference_set_id UUID NOT NULL,
  plan_hash TEXT NOT NULL CHECK (plan_hash ~ '^[a-f0-9]{64}$'),
  copy_hash TEXT NOT NULL CHECK (copy_hash ~ '^[a-f0-9]{64}$'),
  source_hash TEXT NOT NULL CHECK (source_hash ~ '^[a-f0-9]{64}$'),
  reference_content_hash TEXT NOT NULL CHECK (reference_content_hash ~ '^[a-f0-9]{64}$'),
  shot_hash TEXT NOT NULL CHECK (shot_hash ~ '^[a-f0-9]{64}$'),
  actor_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (attempt_id, artifact_role)
);

CREATE OR REPLACE FUNCTION video_storyboard_attempt_protect_request() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  mutable_columns CONSTANT TEXT[] := ARRAY[
    'execution_state','review_state','artifact_sha256','updated_at',
    'ready_at','cancelled_at','reviewed_at'
  ];
BEGIN
  IF (to_jsonb(NEW) - mutable_columns) IS DISTINCT FROM (to_jsonb(OLD) - mutable_columns) THEN
    RAISE EXCEPTION 'Storyboard production request evidence is immutable' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION video_storyboard_production_reject_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Storyboard production evidence is immutable' USING ERRCODE = '55000';
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'video_storyboard_shot_attempts'::regclass AND tgname = 'video_storyboard_attempt_request_immutable') THEN
    CREATE TRIGGER video_storyboard_attempt_request_immutable
      BEFORE UPDATE ON video_storyboard_shot_attempts
      FOR EACH ROW EXECUTE FUNCTION video_storyboard_attempt_protect_request();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'video_storyboard_shot_attempts'::regclass AND tgname = 'video_storyboard_attempt_no_delete') THEN
    CREATE TRIGGER video_storyboard_attempt_no_delete
      BEFORE DELETE ON video_storyboard_shot_attempts
      FOR EACH ROW EXECUTE FUNCTION video_storyboard_production_reject_mutation();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'video_storyboard_shot_approvals'::regclass AND tgname = 'video_storyboard_approval_immutable') THEN
    CREATE TRIGGER video_storyboard_approval_immutable
      BEFORE UPDATE OR DELETE ON video_storyboard_shot_approvals
      FOR EACH ROW EXECUTE FUNCTION video_storyboard_production_reject_mutation();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'video_storyboard_production_allowance_audits'::regclass AND tgname = 'video_storyboard_allowance_audit_immutable') THEN
    CREATE TRIGGER video_storyboard_allowance_audit_immutable
      BEFORE UPDATE OR DELETE ON video_storyboard_production_allowance_audits
      FOR EACH ROW EXECUTE FUNCTION video_storyboard_production_reject_mutation();
  END IF;
END $$;

COMMIT;
