BEGIN;

CREATE TABLE IF NOT EXISTS platform_jobs (
  id UUID PRIMARY KEY,
  job_type TEXT NOT NULL CHECK (char_length(job_type) BETWEEN 1 AND 120),
  client_id UUID REFERENCES agency_clients(id) ON DELETE SET NULL,
  tenant_id TEXT CHECK (tenant_id IS NULL OR char_length(tenant_id) BETWEEN 1 AND 255),
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'retrying', 'succeeded', 'failed', 'dead_lettered')),
  dispatch_mode TEXT NOT NULL DEFAULT 'queue'
    CHECK (dispatch_mode IN ('queue', 'inline')),
  queue_message_id TEXT CHECK (queue_message_id IS NULL OR char_length(queue_message_id) <= 160),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  max_attempts INTEGER NOT NULL DEFAULT 4 CHECK (max_attempts BETWEEN 1 AND 20),
  manual_retry_count INTEGER NOT NULL DEFAULT 0 CHECK (manual_retry_count >= 0),
  replayable BOOLEAN NOT NULL DEFAULT FALSE,
  replay_context JSONB NOT NULL DEFAULT '{}'::jsonb,
  enqueued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  next_attempt_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  last_error_class TEXT CHECK (last_error_class IS NULL OR char_length(last_error_class) <= 160),
  last_error_message_redacted TEXT
    CHECK (last_error_message_redacted IS NULL OR char_length(last_error_message_redacted) <= 255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (pg_column_size(replay_context) <= 4096)
);

CREATE INDEX IF NOT EXISTS idx_platform_jobs_health
  ON platform_jobs (status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_platform_jobs_client
  ON platform_jobs (client_id, updated_at DESC)
  WHERE client_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_platform_jobs_retry_due
  ON platform_jobs (next_attempt_at)
  WHERE status = 'retrying';

INSERT INTO platform_jobs (
  id, job_type, client_id, tenant_id, status, attempt_count,
  enqueued_at, started_at, completed_at, created_at, updated_at
)
SELECT DISTINCT ON (execution.job_id)
       execution.job_id,
       execution.job_type,
       execution.client_id,
       execution.tenant_id,
       CASE execution.status
         WHEN 'succeeded' THEN 'succeeded'
         WHEN 'failed' THEN 'failed'
         ELSE 'running'
       END,
       MAX(execution.attempt) OVER (PARTITION BY execution.job_id),
       COALESCE(execution.enqueued_at, execution.started_at),
       execution.started_at,
       execution.completed_at,
       execution.created_at,
       COALESCE(execution.completed_at, execution.started_at)
  FROM platform_job_executions execution
 ORDER BY execution.job_id, execution.attempt DESC
ON CONFLICT (id) DO NOTHING;

COMMENT ON TABLE platform_jobs IS
  'Canonical payload-free lifecycle state for queued platform work.';
COMMENT ON COLUMN platform_jobs.replay_context IS
  'Allowlisted non-sensitive identifiers only; arbitrary queue payloads are never persisted.';

COMMIT;
