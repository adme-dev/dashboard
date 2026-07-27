import { requireClientAuth } from '~~/server/utils/clientAuth'
import { queryOne } from '~~/server/utils/db'
import { NOISE_SQL } from '~~/server/utils/tracking/analytics-sql'
import { resolveClientTimezone, WINDOW_SQL } from '~~/server/utils/tracking/analytics-window'
import { parsePortalTrackingRange } from '~~/server/utils/tracking/portalRange'

const FUNNEL_EVENTS = [
  ['Viewed', 'page_view'],
  ['Engaged', 'engagement'],
  ['Vehicle views', 'vehicle_view'],
  ['Interaction leads', 'interaction_lead'],
  ['Generate leads', 'generate_lead'],
  ['Test drive bookings', 'test_drive_booking'],
  ['Submitted', 'form_submit']
] as const

export default defineEventHandler(async (event) => {
  const client = await requireClientAuth(event)
  if (!client.permissions.canViewAnalytics) {
    throw createError({ statusCode: 403, statusMessage: 'Analytics access not enabled' })
  }
  const { fromDate, toDate } = parsePortalTrackingRange(event)
  const timezone = await resolveClientTimezone(client.clientId)
  const row = await queryOne<Record<string, unknown>>(
    `SELECT
       COUNT(DISTINCT session_id) FILTER (WHERE event_name = 'page_view') AS page_view,
       COUNT(DISTINCT session_id) FILTER (WHERE event_name = 'engagement') AS engagement,
       COUNT(DISTINCT session_id) FILTER (WHERE event_name = 'vehicle_view') AS vehicle_view,
       COUNT(DISTINCT session_id) FILTER (WHERE event_name = 'interaction_lead') AS interaction_lead,
       COUNT(DISTINCT session_id) FILTER (WHERE event_name = 'generate_lead') AS generate_lead,
       COUNT(DISTINCT session_id) FILTER (WHERE event_name = 'test_drive_booking') AS test_drive_booking,
       COUNT(DISTINCT session_id) FILTER (WHERE event_name = 'form_submit') AS form_submit
     FROM tracking_events e
     WHERE client_id = $1 AND ${WINDOW_SQL} AND ${NOISE_SQL}
       AND session_id IS NOT NULL`,
    [client.clientId, fromDate, toDate, timezone]
  )
  const viewed = Number(row?.page_view) || 0
  const rate = (count: number) => viewed > 0 ? Math.round((count / viewed) * 1000) / 10 : 0
  return {
    steps: FUNNEL_EVENTS.map(([step, eventName]) => {
      const sessions = Number(row?.[eventName]) || 0
      return { step, sessions, rate: eventName === 'page_view' ? 100 : rate(sessions) }
    })
  }
})
