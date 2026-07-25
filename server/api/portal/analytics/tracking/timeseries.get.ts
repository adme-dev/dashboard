import { requireClientAuth } from '~~/server/utils/clientAuth'
import { queryRows } from '~~/server/utils/db'
import { dayBucketExpr, NOISE_SQL } from '~~/server/utils/tracking/analytics-sql'
import { resolveClientTimezone, WINDOW_SQL } from '~~/server/utils/tracking/analytics-window'
import { parsePortalTrackingRange } from '~~/server/utils/tracking/portalRange'

export default defineEventHandler(async (event) => {
  const client = await requireClientAuth(event)
  if (!client.permissions.canViewAnalytics) {
    throw createError({ statusCode: 403, statusMessage: 'Analytics access not enabled' })
  }
  const { fromDate, toDate } = parsePortalTrackingRange(event)
  const timezone = await resolveClientTimezone(client.clientId)
  const rows = await queryRows<{ day: string, visitors: string, events: string }>(
    `SELECT to_char(${dayBucketExpr('$4')}, 'YYYY-MM-DD') AS day,
            COUNT(DISTINCT anon_id) AS visitors,
            COUNT(*) AS events
       FROM tracking_events e
      WHERE client_id = $1 AND ${WINDOW_SQL} AND ${NOISE_SQL}
      GROUP BY day
      ORDER BY day ASC`,
    [client.clientId, fromDate, toDate, timezone]
  )
  setHeader(event, 'Cache-Control', 'private, max-age=30, stale-while-revalidate=120')
  return {
    timezone,
    points: rows.map(row => ({
      day: String(row.day),
      visitors: Number(row.visitors) || 0,
      events: Number(row.events) || 0
    }))
  }
})
