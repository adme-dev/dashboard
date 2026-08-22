-- Add explicit Xero tenant ownership to tracking categories. Options inherit
-- ownership through category_id. Existing NULL ownership remains unclassified until an authenticated selected-tenant Xero sync claims it.

BEGIN;

ALTER TABLE xero_tracking_categories
  ADD COLUMN IF NOT EXISTS tenant_id TEXT;

CREATE INDEX IF NOT EXISTS idx_xero_tracking_categories_tenant_name
  ON xero_tracking_categories (tenant_id, LOWER(name));

COMMENT ON COLUMN xero_tracking_categories.tenant_id IS
  'Owning Xero tenant. NULL is legacy/unclassified and must fail closed in tenant-scoped readers.';

COMMIT;

-- Rollback (manual, destructive):
-- DROP INDEX IF EXISTS idx_xero_tracking_categories_tenant_name;
-- ALTER TABLE xero_tracking_categories DROP COLUMN IF EXISTS tenant_id;
