-- MCP ad-spend sync control: atomic cooldown and terminal coverage state.

ALTER TABLE spend_sync_jobs
  ADD COLUMN IF NOT EXISTS coverage_failed BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS mcp_adspend_sync_cooldown (
  key TEXT PRIMARY KEY,
  next_allowed_at TIMESTAMPTZ NOT NULL,
  requested_platform TEXT NOT NULL,
  started_by UUID REFERENCES team_members(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT mcp_adspend_sync_cooldown_platform_check
    CHECK (requested_platform IN ('meta', 'google', 'all'))
);

