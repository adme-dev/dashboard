-- Add explicit Xero tenant ownership to tracking categories. Options inherit
-- ownership through category_id; legacy rows remain unowned unless this
-- installation has exactly one authoritative Xero organisation.

BEGIN;

ALTER TABLE xero_tracking_categories
  ADD COLUMN IF NOT EXISTS tenant_id TEXT;

WITH sole_connected_tenant AS (
  SELECT MIN(tenant_id) AS tenant_id
  FROM xero_org_connection
  WHERE tenant_id <> '__default__'
  HAVING COUNT(DISTINCT tenant_id) = 1
)
UPDATE xero_tracking_categories category
SET tenant_id = tenant.tenant_id
FROM sole_connected_tenant tenant
WHERE category.tenant_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_xero_tracking_categories_tenant_name
  ON xero_tracking_categories (tenant_id, LOWER(name));

COMMENT ON COLUMN xero_tracking_categories.tenant_id IS
  'Owning Xero tenant. NULL is legacy/unclassified and must fail closed in tenant-scoped readers.';

COMMIT;

-- Rollback (manual, destructive):
-- DROP INDEX IF EXISTS idx_xero_tracking_categories_tenant_name;
-- ALTER TABLE xero_tracking_categories DROP COLUMN IF EXISTS tenant_id;
