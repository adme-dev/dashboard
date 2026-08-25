-- S4: bulk / variant codes grouped under a campaign.
CREATE TABLE IF NOT EXISTS qr_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS qr_campaigns_client_idx ON qr_campaigns(client_id);
ALTER TABLE qr_codes ADD COLUMN IF NOT EXISTS campaign_id uuid REFERENCES qr_campaigns(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS qr_codes_campaign_idx ON qr_codes(campaign_id);
