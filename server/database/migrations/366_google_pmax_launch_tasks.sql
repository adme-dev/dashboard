-- 366_google_pmax_launch_tasks.sql
-- Idempotent linkage between deterministic PMax remediation keys and XeroFlow tasks.

BEGIN;

CREATE TABLE IF NOT EXISTS campaign_launch_tasks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  launch_id UUID NOT NULL,
  config_version INTEGER NOT NULL CHECK (config_version > 0),
  config_hash TEXT NOT NULL CHECK (
    char_length(config_hash) = 64
    AND config_hash ~ '^[a-f0-9]{64}$'
  ),
  task_key VARCHAR(200) NOT NULL CHECK (char_length(task_key) BETWEEN 3 AND 200),
  source_code VARCHAR(100) NOT NULL CHECK (char_length(source_code) BETWEEN 1 AND 100),
  task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
  severity VARCHAR(20) NOT NULL CHECK (severity IN ('blocker', 'advisory')),
  execution VARCHAR(20) NOT NULL CHECK (execution IN ('automatable', 'assisted', 'human')),
  owner_type VARCHAR(20) NOT NULL CHECK (owner_type IN ('platform', 'google_admin', 'client')),
  status VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'cleared', 'superseded')),
  title_snapshot VARCHAR(255) NOT NULL,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  cleared_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (launch_id, config_version, config_hash)
    REFERENCES campaign_launches (id, config_version, config_hash) ON DELETE CASCADE,
  UNIQUE (launch_id, task_key),
  CHECK (
    (status = 'open' AND cleared_at IS NULL)
    OR (status IN ('cleared', 'superseded') AND cleared_at IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_campaign_launch_tasks_open
  ON campaign_launch_tasks (launch_id, severity, last_seen_at DESC)
  WHERE status = 'open';
CREATE INDEX IF NOT EXISTS idx_campaign_launch_tasks_task
  ON campaign_launch_tasks (task_id)
  WHERE task_id IS NOT NULL;

COMMIT;
