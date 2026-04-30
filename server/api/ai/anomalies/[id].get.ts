// server/api/ai/anomalies/[id].get.ts
import { defineEventHandler, getRouterParam, createError } from 'h3'
import { requireRole } from '~~/server/utils/auth'
import { PERMISSIONS } from '~~/server/utils/permissions'
import { getSelectedTenant } from '~~/server/utils/session'
import { queryOne, queryRows } from '~~/server/utils/db'
import type { AnomalyRow } from '~~/server/utils/anomalyDetection/types'

interface AnomalyEventRow {
  id: string
  event: string
  user_id: string | null
  metadata: Record<string, any> | null
  created_at: string
}

export default defineEventHandler(async (event) => {
  await requireRole(event, PERMISSIONS.FINANCE)
  const tenantId = await getSelectedTenant(event)
  if (!tenantId) throw createError({ statusCode: 400, statusMessage: 'No Xero organisation selected' })

  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'id required' })

  const row = await queryOne<AnomalyRow>(
    `SELECT * FROM anomalies WHERE id = $1 AND tenant_id = $2`,
    [id, tenantId],
  )
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Anomaly not found' })

  const events = await queryRows<AnomalyEventRow>(
    `SELECT id, event, user_id, metadata, created_at FROM anomaly_events
     WHERE anomaly_id = $1 ORDER BY created_at DESC LIMIT 100`,
    [id],
  )

  return { anomaly: row, events }
})
