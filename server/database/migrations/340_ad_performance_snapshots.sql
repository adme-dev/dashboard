BEGIN;

CREATE TABLE IF NOT EXISTS ad_performance_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  media_spend_id UUID NOT NULL REFERENCES media_spend(id) ON DELETE CASCADE,
  ad_id TEXT NOT NULL,
  ad_name TEXT,
  range_start DATE NOT NULL,
  range_end DATE NOT NULL,
  spend NUMERIC(14,2) NOT NULL DEFAULT 0,
  impressions BIGINT NOT NULL DEFAULT 0,
  clicks BIGINT NOT NULL DEFAULT 0,
  conversions NUMERIC(14,2) NOT NULL DEFAULT 0,
  reach BIGINT,
  frequency NUMERIC(12,4),
  first_served_date DATE,
  last_served_date DATE,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(media_spend_id, ad_id, range_start, range_end)
);

CREATE INDEX IF NOT EXISTS idx_ad_performance_snapshot_window
  ON ad_performance_snapshots(range_start, range_end, media_spend_id);
CREATE INDEX IF NOT EXISTS idx_ad_performance_snapshot_ad
  ON ad_performance_snapshots(ad_id);

COMMIT;
