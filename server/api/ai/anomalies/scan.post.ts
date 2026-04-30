// server/api/ai/anomalies/scan.post.ts
import { defineEventHandler, createError } from 'h3'
import { requireRole } from '~~/server/utils/auth'
import { PERMISSIONS } from '~~/server/utils/permissions'
import { getSelectedTenant } from '~~/server/utils/session'
import { runDetectionForTenant } from '~~/server/utils/anomalyDetection/runForTenant'

export default defineEventHandler(async (event) => {
  await requireRole(event, PERMISSIONS.FINANCE)
  const tenantId = await getSelectedTenant(event)
  if (!tenantId) throw createError({ statusCode: 400, statusMessage: 'No Xero organisation selected' })
  return runDetectionForTenant(tenantId, { event })
})
