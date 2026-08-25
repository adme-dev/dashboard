-- Approximate scan coordinates (Cloudflare IP geolocation city-centroid) for the scan cluster map.
ALTER TABLE qr_scans ADD COLUMN IF NOT EXISTS lat DOUBLE PRECISION NULL;
ALTER TABLE qr_scans ADD COLUMN IF NOT EXISTS lng DOUBLE PRECISION NULL;
