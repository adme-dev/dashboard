-- S3: CTA frames on export. Per-code frame config (style, label, colour, radius); '{}' = no frame.
ALTER TABLE qr_codes ADD COLUMN IF NOT EXISTS frame jsonb NOT NULL DEFAULT '{}'::jsonb;
