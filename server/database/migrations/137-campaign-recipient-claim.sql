-- 137: campaign_recipients claim column (Phase 2b-2b)
-- Enables safe concurrent draining: a chunk is claimed (claimed_at set) under
-- FOR UPDATE SKIP LOCKED before sending, so an overlapping /send click and a
-- cron dispatch tick never grab the same pending rows. The watchdog re-claims
-- rows whose claim went stale (sender crashed between claim and send).
-- Additive / IF NOT EXISTS — safe to (re)run.

ALTER TABLE campaign_recipients ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ;

-- The claim query targets unclaimed pending rows for a campaign.
CREATE INDEX IF NOT EXISTS idx_campaign_recipients_claimable
  ON campaign_recipients(campaign_id)
  WHERE status = 'pending' AND claimed_at IS NULL;
