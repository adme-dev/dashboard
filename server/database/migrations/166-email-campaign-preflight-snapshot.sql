-- 166: campaign preflight + recipient snapshot
-- Stores the sendability/preflight result captured when a draft is scheduled,
-- plus the recipient-count snapshot used by the dispatch engine.

ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS preflight_result JSONB;

ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS preflight_checked_at TIMESTAMPTZ;

ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS recipient_snapshot JSONB;
