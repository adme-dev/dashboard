-- Private render-preview authority. No public assets; no cascading replay deletion.
CREATE TABLE IF NOT EXISTS banner_engine_jobs (
  job_id uuid PRIMARY KEY,
  attempt_id uuid NOT NULL UNIQUE,
  owner_id uuid NOT NULL,
  request_id uuid NOT NULL,
  payload_sha256 text NOT NULL CHECK (payload_sha256 ~ '^[a-f0-9]{64}$'),
  project_id uuid NOT NULL,
  client_id uuid,
  project_owner_id uuid NOT NULL,
  request jsonb NOT NULL,
  capability jsonb NOT NULL,
  input_asset jsonb NOT NULL,
  input_key text NOT NULL UNIQUE CHECK (input_key LIKE 'engine-jobs/%'),
  output_key text NOT NULL UNIQUE CHECK (output_key LIKE 'engine-jobs/%'),
  output_asset_id uuid NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','cancelling','cancelled','succeeded','failed','uncertain','expired')),
  claim_token_sha256 text CHECK (claim_token_sha256 ~ '^[a-f0-9]{64}$'),
  result jsonb,
  failure_code text CHECK (failure_code IN ('invalid-request','unsupported-capability','invalid-input','invalid-output','duplicate-attempt','cancelled','deadline-exceeded','resource-limit','output-limit','engine-failed','workspace-failed','receipt-failed','transport-failed')),
  termination text CHECK (termination IN ('not-started','adapter-settled','unconfirmed')),
  deadline_at timestamptz NOT NULL,
  execution_deadline_at timestamptz,
  claimed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(owner_id, request_id),
  CHECK ((request->>'jobId')::uuid = job_id AND (request->>'attemptId')::uuid = attempt_id AND (request->>'projectId')::uuid = project_id),
  CHECK ((request->>'clientId')::uuid IS NOT DISTINCT FROM client_id),
  CHECK ((status = 'succeeded') = (result IS NOT NULL)),
  CHECK (status NOT IN ('running','cancelling','succeeded') OR (claim_token_sha256 IS NOT NULL AND execution_deadline_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS banner_engine_jobs_queue ON banner_engine_jobs(created_at, job_id) WHERE status = 'queued';
CREATE INDEX IF NOT EXISTS banner_engine_jobs_expiry ON banner_engine_jobs(deadline_at) WHERE status IN ('queued','running','cancelling');
CREATE INDEX IF NOT EXISTS banner_engine_jobs_project ON banner_engine_jobs(project_id, created_at);

CREATE OR REPLACE FUNCTION protect_banner_engine_job_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(NEW.job_id,NEW.attempt_id,NEW.owner_id,NEW.request_id,NEW.payload_sha256,NEW.project_id,NEW.client_id,NEW.project_owner_id,NEW.request,NEW.capability,NEW.input_asset,NEW.input_key,NEW.output_key,NEW.output_asset_id,NEW.deadline_at,NEW.created_at)
     IS DISTINCT FROM ROW(OLD.job_id,OLD.attempt_id,OLD.owner_id,OLD.request_id,OLD.payload_sha256,OLD.project_id,OLD.client_id,OLD.project_owner_id,OLD.request,OLD.capability,OLD.input_asset,OLD.input_key,OLD.output_key,OLD.output_asset_id,OLD.deadline_at,OLD.created_at) THEN
    RAISE EXCEPTION 'Engine job identity is immutable';
  END IF;
  IF OLD.claim_token_sha256 IS NOT NULL AND ROW(NEW.claim_token_sha256,NEW.claimed_at,NEW.execution_deadline_at) IS DISTINCT FROM ROW(OLD.claim_token_sha256,OLD.claimed_at,OLD.execution_deadline_at) THEN
    RAISE EXCEPTION 'Engine job claim is immutable';
  END IF;
  IF OLD.status IN ('succeeded','failed','cancelled','expired','uncertain') AND NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'Engine job terminal state is immutable';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
    (OLD.status = 'queued' AND NEW.status IN ('running','cancelled','expired','failed')) OR
    (OLD.status = 'running' AND NEW.status IN ('cancelling','succeeded','failed','uncertain')) OR
    (OLD.status = 'cancelling' AND NEW.status IN ('cancelled','uncertain'))
  ) THEN RAISE EXCEPTION 'Invalid engine job state transition'; END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS banner_engine_job_identity ON banner_engine_jobs;
CREATE TRIGGER banner_engine_job_identity BEFORE UPDATE ON banner_engine_jobs FOR EACH ROW EXECUTE FUNCTION protect_banner_engine_job_identity();
