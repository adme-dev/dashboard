-- 286: Durable campaign detail cache coordination and metric snapshots.
--
-- Breakdowns and creatives already persist in their own tables. This state
-- table adds freshness, failure visibility, and a cross-instance lease so
-- multiple tabs/workers cannot issue the same provider request concurrently.

CREATE TABLE IF NOT EXISTS campaign_detail_refresh_state (
  media_spend_id UUID NOT NULL REFERENCES media_spend(id) ON DELETE CASCADE,
  dataset VARCHAR(20) NOT NULL CHECK (dataset IN ('breakdowns', 'creatives')),
  status VARCHAR(20) NOT NULL DEFAULT 'stale'
    CHECK (status IN ('stale', 'refreshing', 'fresh', 'failed')),
  last_attempt_at TIMESTAMPTZ,
  last_success_at TIMESTAMPTZ,
  data_through_at TIMESTAMPTZ,
  next_refresh_at TIMESTAMPTZ,
  lease_token UUID,
  lease_until TIMESTAMPTZ,
  last_error TEXT,
  refresh_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (media_spend_id, dataset)
);

CREATE INDEX IF NOT EXISTS idx_campaign_detail_refresh_due
  ON campaign_detail_refresh_state (next_refresh_at)
  WHERE status IN ('stale', 'failed');

CREATE INDEX IF NOT EXISTS idx_campaign_detail_refresh_lease
  ON campaign_detail_refresh_state (lease_until)
  WHERE status = 'refreshing';

CREATE TABLE IF NOT EXISTS campaign_metric_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  media_spend_id UUID NOT NULL REFERENCES media_spend(id) ON DELETE CASCADE,
  platform VARCHAR(50) NOT NULL,
  spend NUMERIC(14,2) NOT NULL DEFAULT 0,
  impressions BIGINT NOT NULL DEFAULT 0,
  clicks BIGINT NOT NULL DEFAULT 0,
  conversions NUMERIC(14,2) NOT NULL DEFAULT 0,
  revenue NUMERIC(14,2) NOT NULL DEFAULT 0,
  data_through_at TIMESTAMPTZ,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_campaign_metric_snapshots_latest
  ON campaign_metric_snapshots (media_spend_id, captured_at DESC);
