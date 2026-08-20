-- G-2 coverage-delta halt: persist each sync source's last successful returned
-- campaign count so the next run can detect silent coverage shrinkage BEFORE
-- persisting (19 Aug incident: 18 campaigns silently missing while present rows
-- stayed fresh). Additive; IF NOT EXISTS guards throughout.

CREATE TABLE IF NOT EXISTS spend_sync_source_counts (
  platform TEXT NOT NULL,
  source_key TEXT NOT NULL,
  period TEXT NOT NULL DEFAULT '',
  campaign_count INTEGER NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (platform, source_key)
);

CREATE INDEX IF NOT EXISTS idx_spend_sync_source_counts_recorded
  ON spend_sync_source_counts (recorded_at);
