-- Per-client authority for lead capture and CRM promotion.
-- Existing CRM adopters are preserved as full_crm; other clients default to
-- capture_only so confirmed leads remain available without creating CRM records.

ALTER TABLE agency_clients
  ADD COLUMN IF NOT EXISTS lead_capture_mode TEXT NOT NULL DEFAULT 'capture_only';

ALTER TABLE agency_clients
  DROP CONSTRAINT IF EXISTS agency_clients_lead_capture_mode_check;

ALTER TABLE agency_clients
  ADD CONSTRAINT agency_clients_lead_capture_mode_check
  CHECK (lead_capture_mode IN ('analytics_only', 'capture_only', 'lightweight_crm', 'full_crm', 'external_crm'));

UPDATE agency_clients client
SET lead_capture_mode = 'full_crm'
WHERE EXISTS (
  SELECT 1
  FROM lead_crm_links link
  WHERE link.client_id = client.id
);

COMMENT ON COLUMN agency_clients.lead_capture_mode IS
  'analytics_only: browser events only; capture_only: canonical leads; lightweight_crm/full_crm: entitled internal CRM; external_crm: entitled external delivery';
