-- S7: per-client QR settings. export_360 mirrors scans / landing views / leads into the client's
-- first-party tracking_events stream so they sit beside site visits in the client-360 view.
CREATE TABLE IF NOT EXISTS qr_client_settings (
  client_id uuid PRIMARY KEY REFERENCES agency_clients(id) ON DELETE CASCADE,
  export_360 boolean NOT NULL DEFAULT false,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);
