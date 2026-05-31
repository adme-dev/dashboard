/**
 * Manually run a report schedule now ("send now").
 * POST /api/agency/analytics/report-schedules/:id/send
 */
import { requireRole } from '~~/server/utils/auth'
import { PERMISSIONS } from '~~/server/utils/permissions'
import { runReportById } from '~~/server/utils/reports/runReports'

export default defineEventHandler(async (event) => {
  await requireRole(event, [...new Set([...PERMISSIONS.CLIENTS, ...PERMISSIONS.MEDIA_BUYING])])
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'schedule id required' })
  const result = await runReportById(event, id)
  return { ok: true, ...result }
})
