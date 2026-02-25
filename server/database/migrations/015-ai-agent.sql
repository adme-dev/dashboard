-- 015-ai-agent.sql
-- AI Agent: scheduled runs and role-based reports

CREATE TABLE IF NOT EXISTS ai_agent_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_type VARCHAR(50) NOT NULL,
  status VARCHAR(20) DEFAULT 'running',
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  duration_ms INT,
  checks_performed INT DEFAULT 0,
  findings_count INT DEFAULT 0,
  notifications_sent INT DEFAULT 0,
  errors JSONB DEFAULT '[]',
  summary JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ai_agent_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID REFERENCES ai_agent_runs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
  report_type VARCHAR(50) NOT NULL,
  title VARCHAR(500) NOT NULL,
  content TEXT NOT NULL,
  sections JSONB DEFAULT '[]',
  notification_id UUID,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ai_agent_reports_user ON ai_agent_reports(user_id, is_read, created_at DESC);

ALTER TABLE team_members ADD COLUMN IF NOT EXISTS ai_agent_preferences JSONB DEFAULT '{}';
