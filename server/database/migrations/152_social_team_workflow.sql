-- 152_social_team_workflow.sql — Social Suite Slice 2c: team workflow + SLA.
-- Additive. The 2c COLUMNS (assigned_to, assigned_at, sla_due_at, first_response_at, sla_breached)
-- already shipped on social_conversations in 148_social_inbox.sql. This adds only the two new tables.
-- Run: psql "$DATABASE_URL" -f server/database/migrations/152_social_team_workflow.sql

CREATE TABLE IF NOT EXISTS social_saved_replies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES agency_clients(id) ON DELETE CASCADE,  -- NULL = org-wide
  name TEXT NOT NULL,
  category TEXT,
  content TEXT NOT NULL,                          -- may contain {{variables}}
  platforms TEXT[],                               -- NULL/empty = all networks
  usage_count INT NOT NULL DEFAULT 0,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_social_saved_replies_client ON social_saved_replies(client_id);

CREATE TABLE IF NOT EXISTS social_sla_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  channel_type TEXT,                              -- comment|review|dm|mention; NULL = all channels
  target_minutes INT NOT NULL DEFAULT 240,        -- first-response target
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (client_id, channel_type)
);
CREATE INDEX IF NOT EXISTS idx_social_sla_client ON social_sla_policies(client_id, enabled);
