-- 177_social_campaign_action_log.sql
-- Durable audit log for approved campaign-side actions on ad platforms.
-- Current UI is read-only; future Meta/Google write flows should append here.

CREATE TABLE IF NOT EXISTS campaign_action_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  media_spend_id UUID NOT NULL REFERENCES media_spend(id) ON DELETE CASCADE,
  platform VARCHAR(50) NOT NULL CHECK (platform IN ('meta', 'google_ads')),
  action_type VARCHAR(50) NOT NULL,
  action_status VARCHAR(20) NOT NULL DEFAULT 'planned'
    CHECK (action_status IN ('planned', 'pending', 'approved', 'applied', 'failed', 'skipped', 'cancelled')),
  requested_by UUID REFERENCES team_members(id) ON DELETE SET NULL,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  approved_by UUID REFERENCES team_members(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  executed_at TIMESTAMPTZ,
  previous_value JSONB NOT NULL DEFAULT '{}'::jsonb,
  new_value JSONB NOT NULL DEFAULT '{}'::jsonb,
  reason TEXT,
  external_request_id TEXT,
  error_message TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_campaign_action_log_media_spend
  ON campaign_action_log(media_spend_id, COALESCE(executed_at, requested_at, created_at) DESC);

CREATE INDEX IF NOT EXISTS idx_campaign_action_log_status
  ON campaign_action_log(action_status, requested_at DESC);

CREATE INDEX IF NOT EXISTS idx_campaign_action_log_requested_by
  ON campaign_action_log(requested_by, requested_at DESC);
