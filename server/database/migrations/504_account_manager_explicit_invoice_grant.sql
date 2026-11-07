-- Preserve the documented assigned-client invoice workflow when legacy role
-- fallbacks are removed. This grants no company accounting permission and
-- does not change custom roles or individual role assignments.
INSERT INTO role_permission_groups (role_id, permission_group)
SELECT id, 'INVOICE_OWN_CLIENTS'
FROM custom_roles
WHERE slug = 'account_manager' AND is_system = TRUE
ON CONFLICT (role_id, permission_group) DO NOTHING;
