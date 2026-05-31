/** Daily visitors + events in the client's timezone. GET …/:clientId/timeseries?from&to */
import { query } from '~~/server/utils/db'
import { requireClientTrackingAccess } from '~~/server/utils/tracking/analytics-access'
import { parseRange } from '~~/server/utils/tracking/analytics-range'
import { resolveClientTimezone, WINDOW_SQL } from '~~/server/utils/tracking/analytics-window'
import { NOISE_SQL, dayBucketExpr } from '~~/server/utils/tracking/analytics-sql'

export default defineEventHandler(async (event) => {
  const clientId = getRouterParam(event, 'clientId')
  await requireClientTrackingAccess(event, clientId)
  const { fromDate, toDate } = parseRange(getQuery(event) as { from?: string, to?: string })
  const tz = await resolveClientTimezone(clientId)

  // $1 clientId, $2 fromDate, $3 toDate, $4 tz. The window bounds (WINDOW_SQL)
  // and the day bucket both use $4, so each local day is whole and in-range.
  // to_char keeps the day a clean 'YYYY-MM-DD' string (no Date/tz round-trip).
  const rows = await query<any>(
    `SELECT to_char(${dayBucketExpr('$4')}, 'YYYY-MM-DD') AS day,
            COUNT(DISTINCT anon_id) AS visitors,
            COUNT(*) AS events
       FROM tracking_events e
      WHERE client_id = $1 AND ${WINDOW_SQL} AND ${NOISE_SQL}
      GROUP BY day ORDER BY day ASC`,
    [clientId, fromDate, toDate, tz]
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
