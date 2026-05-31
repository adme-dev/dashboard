/**
 * Delete a report schedule.
 * DELETE /api/agency/analytics/report-schedules/:id
 */
import { execute } from '~~/server/utils/db'
import { requireRole } from '~~/server/utils/auth'
import { PERMISSIONS } from '~~/server/utils/permissions'

export default defineEventHandler(async (event) => {
  await requireRole(event, [...new Set([...PERMISSIONS.CLIENTS, ...PERMISSIONS.MEDIA_BUYING])])
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'schedule id required' })
  await execute(`DELETE FROM report_schedules WHERE id = $1`, [id])
  return { ok: true }
})
