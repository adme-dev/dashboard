-- ============================================-- Integration Configs
-- ============================================
CREATE TABLE integration_configs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  integration_type VARCHAR(50) NOT NULL UNIQUE,
  access_token TEXT,
  refresh_token TEXT,
  account_id VARCHAR(255),
  account_name VARCHAR(255),
  connected_by UUID REFERENCES team_members(id),
  connected_at TIMESTAMPTZ,
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_integration_type ON integration_configs(integration_type);

-- ============================================-- Sync Logs
-- ============================================
CREATE TABLE sync_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  integration_type VARCHAR(50) NOT NULL,
  operation VARCHAR(100) NOT NULL,
  status VARCHAR(50) NOT NULL, -- pending, success, partial, error
  started_by UUID REFERENCES team_members(id),
  started_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  details JSONB,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_sync_logs_integration ON sync_logs(integration_type);
CREATE INDEX idx_sync_logs_status ON sync_logs(status);
CREATE INDEX idx_sync_logs_started_at ON sync_logs(started_at DESC);

-- Add triggers for updated_at
CREATE TRIGGER update_integration_configs_updated_at
  BEFORE UPDATE ON integration_configs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
