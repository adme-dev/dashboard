-- Explicit client-portal CRM authorization and access-decision audit ledger.
-- Existing active CRM users retain read/write access. Destructive and
-- administrative operations are limited to primary contacts/user managers.

ALTER TABLE client_users
  ADD COLUMN IF NOT EXISTS can_view_crm BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS can_edit_crm BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS can_admin_crm BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE client_users AS client_user
   SET can_view_crm = TRUE,
       can_edit_crm = TRUE,
       can_admin_crm = (
         client_user.is_primary_contact = TRUE
         OR client_user.can_invite_users = TRUE
       )
  FROM agency_clients AS client
 WHERE client.id = client_user.client_id
   AND client_user.status IN ('active', 'pending')
   AND client.lead_capture_mode IN ('lightweight_crm', 'full_crm');

CREATE TABLE IF NOT EXISTS crm_security_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  client_user_id UUID REFERENCES client_users(id) ON DELETE SET NULL,
  required_access TEXT NOT NULL CHECK (required_access IN ('view', 'edit', 'admin')),
  request_method TEXT NOT NULL,
  request_path TEXT NOT NULL,
  decision TEXT NOT NULL CHECK (decision IN ('allowed', 'denied')),
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_security_audit_client_created
  ON crm_security_audit_log (client_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_crm_security_audit_denied
  ON crm_security_audit_log (client_id, created_at DESC)
  WHERE decision = 'denied';

COMMENT ON COLUMN client_users.can_view_crm IS
  'Allows the client user to read tenant-scoped CRM data when crm.core is entitled.';
COMMENT ON COLUMN client_users.can_edit_crm IS
  'Allows ordinary client CRM mutations; admin also implies edit.';
COMMENT ON COLUMN client_users.can_admin_crm IS
  'Allows destructive, bulk, import, export, schema, audit, and integration actions.';
COMMENT ON TABLE crm_security_audit_log IS
  'Tenant-scoped allow/deny decisions for client portal CRM requests.';
