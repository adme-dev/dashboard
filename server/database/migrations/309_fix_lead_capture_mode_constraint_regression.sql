-- Forward-fix for a migration-ordering regression: a recovery commit resurrected
-- stale copies of an already-superseded migration (283_client_lead_capture_mode.sql)
-- under a lower number than its replacement (288_client_lead_capture_mode.sql), so it
-- re-ran in production and reverted the widened lead_capture_mode CHECK constraint back
-- to the original 3-value set. 'lightweight_crm' and 'external_crm' are offered in the
-- UI and accepted by the API but have been rejected by the live constraint since.
-- This mirrors the 307-over-298 forward-fix pattern: 283/284/285 are left in place
-- (they already ran; deleting them would not change already-applied production state)
-- and this migration re-applies the correct, wider constraint going forward.

BEGIN;

ALTER TABLE agency_clients
  DROP CONSTRAINT IF EXISTS agency_clients_lead_capture_mode_check;

ALTER TABLE agency_clients
  ADD CONSTRAINT agency_clients_lead_capture_mode_check
  CHECK (lead_capture_mode IN ('analytics_only', 'capture_only', 'lightweight_crm', 'full_crm', 'external_crm'));

COMMENT ON COLUMN agency_clients.lead_capture_mode IS
  'analytics_only: browser events only; capture_only: canonical leads; lightweight_crm/full_crm: entitled internal CRM; external_crm: entitled external delivery';

COMMIT;
