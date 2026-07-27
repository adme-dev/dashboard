import { requireClientAuth } from '~~/server/utils/clientAuth'
import { queryOne } from '~~/server/utils/db'
import { NOISE_SQL, numericJsonb } from '~~/server/utils/tracking/analytics-sql'
import { resolveClientTimezone, WINDOW_SQL } from '~~/server/utils/tracking/analytics-window'
import { parsePortalTrackingRange } from '~~/server/utils/tracking/portalRange'

export default defineEventHandler(async (event) => {
  const client = await requireClientAuth(event)
  if (!client.permissions.canViewAnalytics) {
    throw createError({ statusCode: 403, statusMessage: 'Analytics access not enabled' })
  }
  const { fromDate, toDate } = parsePortalTrackingRange(event)
  const timezone = await resolveClientTimezone(client.clientId)
  const row = await queryOne<Record<string, unknown>>(
    `WITH e AS (
       SELECT anon_id, session_id, event_name,
              ${numericJsonb('duration')} AS duration,
              ${numericJsonb('depth')} AS depth
         FROM tracking_events e
        WHERE client_id = $1 AND ${WINDOW_SQL} AND ${NOISE_SQL}
     ), session_engagement AS (
       SELECT session_id, MAX(duration) AS max_duration
         FROM e
        WHERE event_name = 'engagement'
        GROUP BY session_id
     )
     SELECT COUNT(DISTINCT anon_id) AS visitors,
            COUNT(DISTINCT session_id) AS sessions,
            COUNT(*) FILTER (WHERE event_name = 'page_view') AS page_views,
            COUNT(*) AS events,
            COALESCE((SELECT AVG(max_duration) FROM session_engagement), 0) AS avg_engagement_seconds,
            COUNT(DISTINCT session_id) FILTER (WHERE event_name = 'scroll' AND depth >= 75) AS sessions_scrolled_75,
            COUNT(*) FILTER (WHERE event_name = 'phone_click') AS call_clicks,
            COUNT(*) FILTER (WHERE event_name = 'form_submit') AS form_submits,
            COUNT(*) FILTER (WHERE event_name = 'generate_lead') AS generate_leads,
            COUNT(*) FILTER (WHERE event_name = 'test_drive_booking') AS test_drive_bookings,
            COUNT(*) FILTER (WHERE event_name = 'interaction_lead') AS interaction_leads,
            COUNT(*) FILTER (WHERE event_name = 'vehicle_view') AS vehicle_views
       FROM e`,
    [client.clientId, fromDate, toDate, timezone]
  )
  const value = (key: string) => Number(row?.[key]) || 0
  return {
    visitors: value('visitors'),
    sessions: value('sessions'),
    pageViews: value('page_views'),
    events: value('events'),
    avgEngagementSeconds: Math.round(value('avg_engagement_seconds')),
    sessionsScrolled75: value('sessions_scrolled_75'),
    callClicks: value('call_clicks'),
    formSubmits: value('form_submits'),
    generateLeads: value('generate_leads'),
    testDriveBookings: value('test_drive_bookings'),
    interactionLeads: value('interaction_leads'),
    vehicleViews: value('vehicle_views')
  }
})
