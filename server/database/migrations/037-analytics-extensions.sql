-- 037-analytics-extensions.sql
-- Revenue tracking for ROAS computation + client portal analytics permission

-- Revenue columns on media_spend and daily_spend
ALTER TABLE media_spend ADD COLUMN IF NOT EXISTS revenue NUMERIC(12,2) DEFAULT 0;
ALTER TABLE daily_spend ADD COLUMN IF NOT EXISTS revenue NUMERIC(12,2) DEFAULT 0;

-- Client portal analytics permission
ALTER TABLE client_users ADD COLUMN IF NOT EXISTS can_view_analytics BOOLEAN DEFAULT true;

-- Performance indexes for cross-platform queries
CREATE INDEX IF NOT EXISTS idx_ds_date_range ON daily_spend(spend_date) INCLUDE (spend, impressions, clicks, conversions, revenue);
CREATE INDEX IF NOT EXISTS idx_ms_client_period ON media_spend(client_id, period, platform);
CREATE INDEX IF NOT EXISTS idx_ms_period_platform ON media_spend(period, platform) INCLUDE (actual_spend, impressions, clicks, conversions, revenue, client_id);
