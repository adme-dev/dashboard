-- 011-daily-spend.sql
-- Daily spend breakdown per campaign, populated during Meta/Google sync

CREATE TABLE IF NOT EXISTS daily_spend (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  media_spend_id UUID NOT NULL REFERENCES media_spend(id) ON DELETE CASCADE,
  spend_date DATE NOT NULL,
  spend NUMERIC(12, 2) NOT NULL DEFAULT 0,
  impressions INTEGER DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  conversions NUMERIC(12, 2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(media_spend_id, spend_date)
);

CREATE INDEX IF NOT EXISTS idx_daily_spend_media ON daily_spend(media_spend_id);
CREATE INDEX IF NOT EXISTS idx_daily_spend_date ON daily_spend(spend_date);
