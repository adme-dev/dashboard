-- 151_social_automation.sql — Social Suite Slice 2 Phase 2b: reply automation engine.
-- (Numbered 151: 149 = audio voiceover, 150 = audio music-gen (PR #64) — dodged that collision.)
-- Additive. The 2b COLUMNS on social_conversations/social_messages already shipped in
-- 148_social_inbox.sql (automation_state, ai_generated, ai_suggested, ai_confidence,
-- automation_rule_id). This migration adds only the two new 2b tables.
-- Run: psql "$DATABASE_URL" -f server/database/migrations/151_social_automation.sql

CREATE TABLE IF NOT EXISTS social_automation_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  platform TEXT,                                  -- NULL = all platforms
  channel_type TEXT,                              -- comment|review|... NULL = all channels
  mode TEXT NOT NULL DEFAULT 'off',               -- off|suggest|approval|autopilot
  conditions JSONB NOT NULL DEFAULT '{}'::jsonb,  -- {ratingMin,ratingMax,keywordsAny[],keywordsNone[],businessHoursOnly}
  action JSONB NOT NULL DEFAULT '{}'::jsonb,       -- {aiPrompt?: string}  (saved-reply ref is 2c)
  approval_by TEXT NOT NULL DEFAULT 'staff',       -- staff|client|none
  rate_limit INT NOT NULL DEFAULT 0,               -- max auto-actions per rule per rolling hour; 0 = unlimited
  confidence_floor NUMERIC NOT NULL DEFAULT 0.7,   -- below this, autopilot downgrades to approval
  business_hours JSONB,                            -- {tz, days:[1..7], start:"09:00", end:"17:00"}
  priority INT NOT NULL DEFAULT 100,               -- lower = evaluated first
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_social_rules_match
  ON social_automation_rules(client_id, enabled, priority);

CREATE TABLE IF NOT EXISTS social_response_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES social_conversations(id) ON DELETE CASCADE,
  message_id UUID REFERENCES social_messages(id) ON DELETE SET NULL,  -- the inbound being answered
  rule_id UUID REFERENCES social_automation_rules(id) ON DELETE SET NULL,
  draft_content TEXT NOT NULL,
  confidence NUMERIC,
  status TEXT NOT NULL DEFAULT 'pending',          -- pending|approved|rejected|sent|failed|skipped
  effective_mode TEXT NOT NULL,                    -- approval|autopilot (the mode AFTER guardrails)
  approver_type TEXT NOT NULL DEFAULT 'staff',     -- staff|client|none
  approved_by TEXT,
  approved_at TIMESTAMPTZ,
  guardrail_notes TEXT,                            -- why downgraded/skipped (audit)
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- Idempotency: at most one automation queue row per inbound message.
CREATE UNIQUE INDEX IF NOT EXISTS uq_social_queue_message
  ON social_response_queue(message_id)
  WHERE message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_social_queue_client_status
  ON social_response_queue(client_id, status, created_at DESC);
