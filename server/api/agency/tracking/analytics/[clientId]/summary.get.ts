/** KPI summary for a client + date range. GET /api/agency/tracking/analytics/:clientId/summary?from&to */
import { queryOne } from '~~/server/utils/db'
import { requireClientTrackingAccess } from '~~/server/utils/tracking/analytics-access'
import { parseRange } from '~~/server/utils/tracking/analytics-range'
import { NOISE_SQL, numericJsonb } from '~~/server/utils/tracking/analytics-sql'

export default defineEventHandler(async (event) => {
  const clientId = getRouterParam(event, 'clientId')
  await requireClientTrackingAccess(event, clientId)
  const range = parseRange(getQuery(event) as { from?: string, to?: string })

  const row = await queryOne<any>(
    `WITH e AS (
        SELECT anon_id, session_id, event_name,
               ${numericJsonb('duration')} AS dur,
               ${numericJsonb('depth')} AS depth
          FROM tracking_events e
         WHERE client_id = $1 AND received_at >= $2 AND received_at < $3 AND ${NOISE_SQL}
     ),
     sess_eng AS (SELECT session_id, MAX(dur) AS max_dur FROM e WHERE event_name='engagement' GROUP BY session_id),
     sess_scroll AS (SELECT DISTINCT session_id FROM e WHERE event_name='scroll' AND depth >= 75)
     SELECT
       (SELECT COUNT(DISTINCT anon_id)   FROM e) AS visitors,
       (SELECT COUNT(DISTINCT session_id) FROM e) AS sessions,
       (SELECT COUNT(*) FROM e WHERE event_name='page_view') AS page_views,
       (SELECT COUNT(*) FROM e) AS events,
       COALESCE((SELECT AVG(max_dur) FROM sess_eng), 0) AS avg_engagement_seconds,
       (SELECT COUNT(*) FROM sess_scroll) AS sessions_scrolled_75,
       (SELECT COUNT(*) FROM e WHERE event_name='phone_click') AS call_clicks,
       (SELECT COUNT(*) FROM e WHERE event_name='form_submit') AS form_submits`,
    [clientId, range.from.toISOString(), range.toExclusive.toISOString()]
  )

  return {
    visitors: Number(row?.visitors) || 0,
    sessions: Number(row?.sessions) || 0,
    pageViews: Number(row?.page_views) || 0,
    events: Number(row?.events) || 0,
    avgEngagementSeconds: Math.round(Number(row?.avg_engagement_seconds) || 0),
    sessionsScrolled75: Number(row?.sessions_scrolled_75) || 0,
    callClicks: Number(row?.call_clicks) || 0,
    formSubmits: Number(row?.form_submits) || 0
  }
})
