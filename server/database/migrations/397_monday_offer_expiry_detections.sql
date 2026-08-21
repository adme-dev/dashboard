-- Idempotency ledger for policy-backed rolling-campaign offer expiry findings.

CREATE TABLE IF NOT EXISTS monday_offer_expiry_detections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform TEXT NOT NULL,
  campaign_id TEXT NOT NULL,
  creative_id TEXT NOT NULL,
  expires_on DATE NOT NULL,
  monday_item_id TEXT,
  status TEXT NOT NULL DEFAULT 'detected' CHECK (status IN ('detected', 'created', 'failed')),
  failure_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (platform, campaign_id, creative_id, expires_on)
);

CREATE INDEX IF NOT EXISTS idx_monday_offer_expiry_detections_status
  ON monday_offer_expiry_detections (status, created_at DESC);
