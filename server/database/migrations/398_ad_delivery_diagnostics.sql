BEGIN;

ALTER TABLE ad_performance_snapshots
  ADD COLUMN IF NOT EXISTS ad_set_id TEXT,
  ADD COLUMN IF NOT EXISTS ad_set_name TEXT,
  ADD COLUMN IF NOT EXISTS cpm NUMERIC(14,4),
  ADD COLUMN IF NOT EXISTS ad_set_metrics_synced_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ad_set_metrics_unavailable_reason TEXT,
  ADD COLUMN IF NOT EXISTS approval_status TEXT,
  ADD COLUMN IF NOT EXISTS provider_approval_status TEXT,
  ADD COLUMN IF NOT EXISTS approval_review_status TEXT,
  ADD COLUMN IF NOT EXISTS policy_issues JSONB,
  ADD COLUMN IF NOT EXISTS approval_synced_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approval_unavailable_reason TEXT,
  ADD COLUMN IF NOT EXISTS learning_stage TEXT,
  ADD COLUMN IF NOT EXISTS provider_learning_stage TEXT,
  ADD COLUMN IF NOT EXISTS learning_stage_synced_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS learning_stage_unavailable_reason TEXT;

ALTER TABLE media_spend
  ADD COLUMN IF NOT EXISTS serving_status TEXT,
  ADD COLUMN IF NOT EXISTS serving_status_reasons TEXT[],
  ADD COLUMN IF NOT EXISTS provider_serving_status_reasons TEXT[],
  ADD COLUMN IF NOT EXISTS serving_status_synced_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS serving_status_unavailable_reason TEXT,
  ADD COLUMN IF NOT EXISTS impression_share_synced_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS impression_share_unavailable_reason TEXT;

CREATE TABLE IF NOT EXISTS campaign_search_term_syncs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  media_spend_id UUID NOT NULL REFERENCES media_spend(id) ON DELETE CASCADE,
  range_start DATE NOT NULL,
  range_end DATE NOT NULL,
  coverage TEXT NOT NULL CHECK (coverage IN ('full', 'limited', 'unsupported', 'unavailable')),
  coverage_reason TEXT,
  synced_at TIMESTAMPTZ,
  last_attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_error TEXT,
  source_total INTEGER NOT NULL DEFAULT 0 CHECK (source_total >= 0),
  truncated_at_source BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE(media_spend_id, range_start, range_end)
);

CREATE TABLE IF NOT EXISTS campaign_search_term_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sync_id UUID NOT NULL REFERENCES campaign_search_term_syncs(id) ON DELETE CASCADE,
  search_term TEXT NOT NULL,
  match_type TEXT,
  targeting_status TEXT,
  impressions BIGINT NOT NULL DEFAULT 0,
  clicks BIGINT NOT NULL DEFAULT 0,
  cost NUMERIC(14,2) NOT NULL DEFAULT 0
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_campaign_search_terms_identity
  ON campaign_search_term_snapshots(sync_id, search_term, COALESCE(match_type, ''));
CREATE INDEX IF NOT EXISTS idx_campaign_search_term_sync_window
  ON campaign_search_term_syncs(media_spend_id, range_start, range_end);
CREATE INDEX IF NOT EXISTS idx_campaign_search_terms_cost
  ON campaign_search_term_snapshots(sync_id, cost DESC);
CREATE INDEX IF NOT EXISTS idx_campaign_search_terms_clicks
  ON campaign_search_term_snapshots(sync_id, clicks DESC);

COMMIT;
