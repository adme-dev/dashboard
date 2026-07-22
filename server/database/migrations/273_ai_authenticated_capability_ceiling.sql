-- Allow a governed capability to target any authenticated staff member without pretending that
-- the caller holds a privileged permission group. Runtime composition still starts from the
-- RBAC-filtered tool registry, so this ceiling can only narrow existing authority and cannot grant.

ALTER TABLE ai_capability_versions
  DROP CONSTRAINT IF EXISTS ai_capability_versions_required_permission_group_check;

ALTER TABLE ai_capability_versions
  ADD CONSTRAINT ai_capability_versions_required_permission_group_check
  CHECK (required_permission_group IN (
    'AUTHENTICATED',
    'ADMIN', 'HR_ADMIN', 'MANAGEMENT', 'FINANCE', 'SALES', 'CLIENTS',
    'CREATIVE', 'MEDIA_BUYING', 'TIME_APPROVALS', 'AUTOMATION', 'INVOICE_OWN_CLIENTS'
  )) NOT VALID;

ALTER TABLE ai_capability_versions
  VALIDATE CONSTRAINT ai_capability_versions_required_permission_group_check;
