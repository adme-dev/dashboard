-- Link social connections (ad accounts) to agency clients
-- This enables the analytics client filter to resolve campaigns → clients
-- via media_spend.connection_id → social_connections.client_id

ALTER TABLE social_connections ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES agency_clients(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_social_connections_client ON social_connections(client_id);
