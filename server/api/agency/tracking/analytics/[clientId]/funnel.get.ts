/** Session funnel page_view -> engagement -> form_submit. GET …/:clientId/funnel?from&to */
import { queryOne } from '~~/server/utils/db'
import { requireClientTrackingAccess } from '~~/server/utils/tracking/analytics-access'
import { parseRange } from '~~/server/utils/tracking/analytics-range'
import { resolveClientTimezone, WINDOW_SQL } from '~~/server/utils/tracking/analytics-window'
import { NOISE_SQL } from '~~/server/utils/tracking/analytics-sql'

export default defineEventHandler(async (event) => {
  const clientId = getRouterParam(event, 'clientId')
  await requireClientTrackingAccess(event, clientId)
  const { fromDate, toDate } = parseRange(getQuery(event) as { from?: string, to?: string })
  const tz = await resolveClientTimezone(clientId)

  // $1 clientId, $2 fromDate, $3 toDate, $4 tz
  const row = await queryOne<any>(
    `WITH e AS (
        SELECT session_id, event_name FROM tracking_events e
         WHERE client_id = $1 AND ${WINDOW_SQL} AND ${NOISE_SQL}
           AND session_id IS NOT NULL
     )
     SELECT
       COUNT(DISTINCT session_id) FILTER (WHERE event_name='page_view')   AS viewed,
       COUNT(DISTINCT session_id) FILTER (WHERE event_name='engagement')  AS engaged,
       COUNT(DISTINCT session_id) FILTER (WHERE event_name='form_submit') AS converted
       FROM e`,
    [clientId, fromDate, toDate, tz]
  )
  const viewed = Number(row?.viewed) || 0
  const engaged = Number(row?.engaged) || 0
  const converted = Number(row?.converted) || 0
  const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 1000) / 10 : 0)
  return {
    steps: [
      { step: 'Viewed', sessions: viewed, rate: 100 },
      { step: 'Engaged', sessions: engaged, rate: pct(engaged, viewed) },
      { step: 'Submitted', sessions: converted, rate: pct(converted, viewed) }
    ]
  }
})
