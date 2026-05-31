/** Daily visitors + events in the client's timezone. GET …/:clientId/timeseries?from&to */
import { query, queryOne } from '~~/server/utils/db'
import { requireClientTrackingAccess } from '~~/server/utils/tracking/analytics-access'
import { parseRange } from '~~/server/utils/tracking/analytics-range'
import { NOISE_SQL, dayBucketExpr } from '~~/server/utils/tracking/analytics-sql'

export default defineEventHandler(async (event) => {
  const clientId = getRouterParam(event, 'clientId')
  await requireClientTrackingAccess(event, clientId)
  const range = parseRange(getQuery(event) as { from?: string, to?: string })

  const tzRow = await queryOne<any>(`SELECT reporting_timezone FROM agency_clients WHERE id = $1`, [clientId])
  const tz = tzRow?.reporting_timezone || 'Australia/Brisbane'

  // $1 clientId, $2 from, $3 toExclusive, $4 tz
  // Format the local day as text in SQL (to_char) so the driver returns a clean
  // 'YYYY-MM-DD' string — NOT a Date, which toISOString() would shift by the
  // process/machine timezone and render off-by-one.
  const rows = await query<any>(
    `SELECT to_char(${dayBucketExpr('$4')}, 'YYYY-MM-DD') AS day,
            COUNT(DISTINCT anon_id) AS visitors,
            COUNT(*) AS events
       FROM tracking_events e
      WHERE client_id = $1 AND received_at >= $2 AND received_at < $3 AND ${NOISE_SQL}
      GROUP BY day ORDER BY day ASC`,
    [clientId, range.from.toISOString(), range.toExclusive.toISOString(), tz]
  )

  return {
    timezone: tz,
    points: rows.map(r => ({
      day: String(r.day),
      visitors: Number(r.visitors) || 0,
      events: Number(r.events) || 0
    }))
  }
})
