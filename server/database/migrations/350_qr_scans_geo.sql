-- QR scan geo detail (city / region / postcode) from Cloudflare IP geolocation (request.cf).
-- Approximate: reflects the ISP/carrier's location, suburb-level at best. Additive; NULL when unknown.
ALTER TABLE qr_scans ADD COLUMN IF NOT EXISTS city     TEXT NULL;
ALTER TABLE qr_scans ADD COLUMN IF NOT EXISTS region   TEXT NULL;
ALTER TABLE qr_scans ADD COLUMN IF NOT EXISTS postcode TEXT NULL;
