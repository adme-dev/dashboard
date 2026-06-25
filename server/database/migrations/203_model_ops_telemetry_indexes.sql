-- Model Ops telemetry dashboard indexes.
-- Additive only: keeps admin dashboard and orchestrator read-tool summaries cheap
-- as ai_agent_runs, ai_agent_reports, and legacy ai_messages grow.

CREATE INDEX IF NOT EXISTS idx_ai_agent_runs_started_at
  ON ai_agent_runs (started_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_agent_runs_created_at
  ON ai_agent_runs (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_agent_runs_type_started
  ON ai_agent_runs (run_type, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_agent_reports_run
  ON ai_agent_reports (run_id);

CREATE INDEX IF NOT EXISTS idx_ai_messages_assistant_created
  ON ai_messages (created_at DESC)
  WHERE role = 'assistant';
