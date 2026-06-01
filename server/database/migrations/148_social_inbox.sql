-- 148_social_inbox.sql — Social Suite Slice 2: unified engagement inbox + reviews.
-- (Renumbered 147→148: origin/main shipped 147-crm-sales-productivity.sql via #60.)
-- Additive. Columns for later phases (2b automation, 2c SLA, 2d portal) are included
-- but unused in 2a. Run: psql "$DATABASE_URL" -f server/database/migrations/148_social_inbox.sql

CREATE TABLE IF NOT EXISTS social_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  social_account_id UUID REFERENCES social_accounts(id) ON DELETE SET NULL,
  platform TEXT NOT NULL,                       -- facebook|instagram|linkedin|tiktok|youtube|google-business
  channel_type TEXT NOT NULL,                   -- comment|dm|mention|review
  platform_conversation_id TEXT NOT NULL,       -- post/thread/review id on the platform
  permalink TEXT,
  participant_id TEXT,
  participant_name TEXT,
  participant_handle TEXT,
  status TEXT NOT NULL DEFAULT 'open',           -- open|snoozed|closed
  snoozed_until TIMESTAMPTZ,
  priority TEXT,
  assigned_to TEXT,                              -- (2c)
  assigned_at TIMESTAMPTZ,
  last_message_at TIMESTAMPTZ,
  last_message_preview TEXT,
  last_message_direction TEXT,                   -- in|out
  unread_count INT NOT NULL DEFAULT 0,
  message_count INT NOT NULL DEFAULT 0,
  sentiment NUMERIC,
  rating INT,                                    -- reviews only
  tags TEXT[],
  sla_due_at TIMESTAMPTZ,                         -- (2c)
  first_response_at TIMESTAMPTZ,                  -- (2c)
  sla_breached BOOLEAN NOT NULL DEFAULT FALSE,    -- (2c)
  automation_state TEXT,                          -- (2b)
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (social_account_id, channel_type, platform_conversation_id)
);
CREATE INDEX IF NOT EXISTS idx_social_conv_client ON social_conversations(client_id, status, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_social_conv_channel ON social_conversations(client_id, channel_type);

CREATE TABLE IF NOT EXISTS social_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES social_conversations(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  platform_message_id TEXT,                      -- idempotency (nullable for notes/pending-outbound)
  direction TEXT NOT NULL,                       -- in|out
  author_id TEXT,
  author_name TEXT,
  message_type TEXT NOT NULL DEFAULT 'text',     -- text|image|video|comment|review|...
  content TEXT,
  attachments JSONB NOT NULL DEFAULT '[]'::jsonb,
  parent_message_id UUID REFERENCES social_messages(id) ON DELETE SET NULL,
  is_internal_note BOOLEAN NOT NULL DEFAULT FALSE,
  sent_by_user_id TEXT,
  ai_generated BOOLEAN NOT NULL DEFAULT FALSE,    -- (2b)
  ai_suggested BOOLEAN NOT NULL DEFAULT FALSE,    -- (2b)
  ai_confidence NUMERIC,                          -- (2b)
  automation_rule_id UUID,                        -- (2b)
  platform_timestamp TIMESTAMPTZ,
  reactions JSONB,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_social_msg_platform
  ON social_messages(conversation_id, platform_message_id)
  WHERE platform_message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_social_msg_conv ON social_messages(conversation_id, platform_timestamp);

CREATE TABLE IF NOT EXISTS social_sync_cursors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  social_account_id UUID NOT NULL REFERENCES social_accounts(id) ON DELETE CASCADE,
  channel_type TEXT NOT NULL,                    -- comment|review
  cursor TEXT,                                   -- platform page-token / ISO ts / last-id
  last_synced_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (social_account_id, channel_type)
);
