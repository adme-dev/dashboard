-- Keep social spend summary sync-status lookups cheap as job history grows.
CREATE INDEX IF NOT EXISTS idx_spend_sync_jobs_period_platform_started
  ON spend_sync_jobs (period, platform, started_at DESC);
