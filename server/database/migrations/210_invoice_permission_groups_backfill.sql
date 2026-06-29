-- 210_invoice_permission_groups_backfill.sql
-- Backfill the INVOICE_OWN_CLIENTS permission group introduced after the
-- original custom role seed so DB-resolved roles match the static RBAC map.

INSERT INTO role_permission_groups (role_id, permission_group)
SELECT cr.id, 'INVOICE_OWN_CLIENTS'
FROM custom_roles cr
WHERE cr.slug IN (
  'owner',
  'admin',
  'lead',
  'project_manager',
  'account_manager',
  'finance',
  'accounts'
)
ON CONFLICT DO NOTHING;
