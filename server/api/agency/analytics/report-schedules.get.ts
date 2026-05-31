/**
 * List report schedules (+ last run status).
 * GET /api/agency/analytics/report-schedules
 */
import { queryRows } from '~~/server/utils/db'
import { requireRole } from '~~/server/utils/auth'
import { PERMISSIONS } from '~~/server/utils/permissions'

export default defineEventHandler(async (event) => {
  await requireRole(event, [...new Set([...PERMISSIONS.CLIENTS, ...PERMISSIONS.MEDIA_BUYING])])
  const rows = await queryRows(`
    SELECT s.id, s.client_id::text AS client_id, c.name AS client_name,
           s.cadence, s.recipients, s.branding, s.enabled,
           s.last_run_at, s.created_at,
           (SELECT r.status FROM report_runs r WHERE r.schedule_id = s.id ORDER BY r.created_at DESC LIMIT 1) AS last_status,
           (SELECT r.report_url FROM report_runs r WHERE r.schedule_id = s.id ORDER BY r.created_at DESC LIMIT 1) AS last_report_url
    FROM report_schedules s
    LEFT JOIN agency_clients c ON c.id = s.client_id
    ORDER BY s.created_at DESC
  `)
  return { schedules: rows }
})
