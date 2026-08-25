-- S6: A/B destinations. Per-code arm config and the arm each scan was sent to.
ALTER TABLE qr_codes ADD COLUMN IF NOT EXISTS ab jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE qr_scans ADD COLUMN IF NOT EXISTS variant text CHECK (variant IN ('A','B'));
