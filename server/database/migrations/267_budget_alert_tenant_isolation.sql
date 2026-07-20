-- Add tenant ownership to budget alerts without guessing across Xero organisations.
--
-- Legacy rows are safe to backfill only when this installation has exactly one
-- authoritative, non-placeholder org connection. If multiple tenants exist, the
-- rows remain NULL and tenant-scoped readers must exclude them until an operator
-- classifies them explicitly.

ALTER TABLE budget_alerts
  ADD COLUMN IF NOT EXISTS tenant_id TEXT;

WITH sole_connected_tenant AS (
  SELECT MIN(tenant_id) AS tenant_id
  FROM xero_org_connection
  WHERE tenant_id <> '__default__'
  HAVING COUNT(DISTINCT tenant_id) = 1
)
UPDATE budget_alerts ba
SET tenant_id = tenant.tenant_id
FROM sole_connected_tenant tenant
WHERE ba.tenant_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_budget_alerts_tenant_status_created
  ON budget_alerts(tenant_id, status, created_at DESC);

COMMENT ON COLUMN budget_alerts.tenant_id IS
  'Owning Xero tenant. NULL is legacy/unclassified and must fail closed in tenant-scoped readers.';

-- Rollback (manual, destructive):
-- DROP INDEX IF EXISTS idx_budget_alerts_tenant_status_created;
-- ALTER TABLE budget_alerts DROP COLUMN IF EXISTS tenant_id;
