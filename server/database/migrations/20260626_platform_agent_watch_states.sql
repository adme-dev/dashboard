CREATE TABLE IF NOT EXISTS platform_agent_watch_states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_type TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  scope_key TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  previous_fingerprint TEXT,
  severity_score INTEGER NOT NULL DEFAULT 0,
  previous_severity_score INTEGER,
  state_status TEXT NOT NULL DEFAULT 'new'
    CHECK (state_status IN ('new', 'unchanged', 'worsened', 'improved', 'resolved')),
  summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(agent_type, tenant_id, scope_key)
);

CREATE INDEX IF NOT EXISTS idx_platform_agent_watch_states_agent_scope
  ON platform_agent_watch_states(agent_type, tenant_id, scope_key);
