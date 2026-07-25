BEGIN;

CREATE TABLE IF NOT EXISTS platform_job_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL,
  job_type TEXT NOT NULL CHECK (char_length(job_type) BETWEEN 1 AND 120),
  client_id UUID REFERENCES agency_clients(id) ON DELETE SET NULL,
  tenant_id TEXT CHECK (tenant_id IS NULL OR char_length(tenant_id) BETWEEN 1 AND 255),
  attempt INTEGER NOT NULL CHECK (attempt > 0),
  status TEXT NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'succeeded', 'failed')),
  enqueued_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER CHECK (duration_ms IS NULL OR duration_ms >= 0),
  error_class TEXT CHECK (error_class IS NULL OR char_length(error_class) <= 160),
  error_message_redacted TEXT
    CHECK (error_message_redacted IS NULL OR char_length(error_message_redacted) <= 255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (job_id, attempt)
);

CREATE INDEX IF NOT EXISTS idx_platform_job_executions_health
  ON platform_job_executions (started_at DESC, status);

CREATE INDEX IF NOT EXISTS idx_platform_job_executions_client
  ON platform_job_executions (client_id, started_at DESC)
  WHERE client_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_platform_job_executions_failures
  ON platform_job_executions (job_type, completed_at DESC)
  WHERE status = 'failed';

COMMENT ON TABLE platform_job_executions IS
  'Payload-free execution evidence for background jobs. Stores operational metadata only.';

COMMIT;
