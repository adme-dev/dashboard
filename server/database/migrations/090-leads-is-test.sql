-- 090-leads-is-test.sql
-- Adds is_test flag to leads so Google Ads "Send test data" submissions
-- (and equivalent Meta is_test events) can be hidden from the inbox by
-- default and surfaced only when a marketer explicitly toggles them on.

ALTER TABLE leads ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false;

-- Partial index — most queries filter is_test = false. Tiny index, fast lookups.
CREATE INDEX IF NOT EXISTS idx_leads_is_test_false
  ON leads (ingested_at DESC)
  WHERE is_test = false AND deleted_at IS NULL;
