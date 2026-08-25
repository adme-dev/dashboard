-- Per-code utm_source override (NULL = 'qr'), e.g. 'tv' for a broadcast spot, 'instagram' for a social placement.
ALTER TABLE qr_codes ADD COLUMN IF NOT EXISTS utm_source TEXT NULL;
