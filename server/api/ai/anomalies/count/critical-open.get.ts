// server/api/ai/anomalies/count/critical-open.get.ts
import { defineEventHandler } from 'h3'
import { requireRole } from '~~/server/utils/auth'
import { PERMISSIONS } from '~~/server/utils/permissions'
import { getSelectedTenant } from '~~/server/utils/session'
import { queryOne } from '~~/server/utils/db'

export default defineEventHandler(async (event) => {
  await requireRole(event, PERMISSIONS.FINANCE)
  const tenantId = await getSelectedTenant(event)
  if (!tenantId) return { count: 0 }
  const row = await queryOne<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM anomalies
     WHERE tenant_id = $1 AND status = 'open' AND severity = 'critical'`,
    [tenantId],
  )
  return { count: Number(row?.count ?? 0) }
})
