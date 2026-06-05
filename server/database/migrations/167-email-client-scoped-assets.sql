-- Client ownership for email image assets. NULL remains agency-wide.

ALTER TABLE banner_assets
  ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES agency_clients(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_banner_assets_client
  ON banner_assets(client_id);
