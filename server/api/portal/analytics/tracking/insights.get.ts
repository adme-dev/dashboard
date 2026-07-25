import { requireClientAuth } from '~~/server/utils/clientAuth'
import { queryRows } from '~~/server/utils/db'
import { NOISE_SQL, numericJsonb } from '~~/server/utils/tracking/analytics-sql'
import { resolveClientTimezone, WINDOW_SQL } from '~~/server/utils/tracking/analytics-window'
import { parsePortalTrackingRange } from '~~/server/utils/tracking/portalRange'

const DIMENSIONS = {
  pages: `COALESCE(NULLIF(page_url, ''), '(none)')`,
  sources: `COALESCE(NULLIF(utm_source, ''), '(none)')`,
  devices: `CASE
    WHEN ua ~* '(iPad|Tablet)' OR (ua ~* 'Android' AND ua !~* 'Mobile') THEN 'tablet'
    WHEN ua ~* '(Mobi|iPhone|iPod|Android.*Mobile|Windows Phone)' THEN 'mobile'
    WHEN ua IS NULL THEN 'unknown'
    ELSE 'desktop' END`
} as const

interface BehaviorRow {
  key: string
  visitors: string
  sessions: string
  page_views: string
  events: string
  engaged_sessions: string
  avg_engagement_seconds: string
  scroll_75_sessions: string
  vehicle_views: string
  phone_clicks: string
  form_submits: string
  lead_intents: string
  confirmed_leads: string
  qualified_leads: string
  won_leads: string
}

async function loadDimension(
  clientId: string,
  fromDate: string,
  toDate: string,
  timezone: string,
  expression: string
) {
  const rows = await queryRows<BehaviorRow>(
    `SELECT ${expression} AS key,
            COUNT(DISTINCT anon_id) AS visitors,
            COUNT(DISTINCT session_id) AS sessions,
            COUNT(*) FILTER (WHERE event_name = 'page_view') AS page_views,
            COUNT(*) AS events,
            COUNT(DISTINCT session_id) FILTER (WHERE event_name = 'engagement') AS engaged_sessions,
            COALESCE(AVG(${numericJsonb('duration')}) FILTER (WHERE event_name = 'engagement'), 0) AS avg_engagement_seconds,
            COUNT(DISTINCT session_id) FILTER (
              WHERE event_name = 'scroll' AND ${numericJsonb('depth')} >= 75
            ) AS scroll_75_sessions,
            COUNT(*) FILTER (WHERE event_name = 'vehicle_view') AS vehicle_views,
            COUNT(*) FILTER (WHERE event_name = 'phone_click') AS phone_clicks,
            COUNT(*) FILTER (WHERE event_name = 'form_submit') AS form_submits,
            COUNT(*) FILTER (WHERE event_name IN ('form_submit', 'interaction_lead')) AS lead_intents,
            COUNT(*) FILTER (WHERE event_name = 'generate_lead') AS confirmed_leads,
            COUNT(*) FILTER (WHERE event_name = 'lead_qualified') AS qualified_leads,
            COUNT(*) FILTER (WHERE event_name = 'lead_won') AS won_leads
       FROM tracking_events e
      WHERE client_id = $1 AND ${WINDOW_SQL} AND ${NOISE_SQL}
      GROUP BY key
      ORDER BY sessions DESC
      LIMIT 10`,
    [clientId, fromDate, toDate, timezone]
  )
  return rows.map((row) => {
    const sessions = Number(row.sessions) || 0
    const confirmedLeads = Number(row.confirmed_leads) || 0
    return {
      key: String(row.key),
      visitors: Number(row.visitors) || 0,
      sessions,
      pageViews: Number(row.page_views) || 0,
      events: Number(row.events) || 0,
      engagedSessions: Number(row.engaged_sessions) || 0,
      engagementRate: sessions ? (Number(row.engaged_sessions) || 0) / sessions : 0,
      avgEngagementSeconds: Math.round(Number(row.avg_engagement_seconds) || 0),
      scroll75Sessions: Number(row.scroll_75_sessions) || 0,
      vehicleViews: Number(row.vehicle_views) || 0,
      phoneClicks: Number(row.phone_clicks) || 0,
      formSubmits: Number(row.form_submits) || 0,
      leadIntents: Number(row.lead_intents) || 0,
      confirmedLeads,
      qualifiedLeads: Number(row.qualified_leads) || 0,
      wonLeads: Number(row.won_leads) || 0,
      confirmedLeadRate: sessions ? confirmedLeads / sessions : 0
    }
  })
}

export default defineEventHandler(async (event) => {
  const client = await requireClientAuth(event)
  if (!client.permissions.canViewAnalytics) {
    throw createError({ statusCode: 403, statusMessage: 'Analytics access not enabled' })
  }
  const { fromDate, toDate } = parsePortalTrackingRange(event)
  const timezone = await resolveClientTimezone(client.clientId)
  const [pages, devices, sources] = await Promise.all([
    loadDimension(client.clientId, fromDate, toDate, timezone, DIMENSIONS.pages),
    loadDimension(client.clientId, fromDate, toDate, timezone, DIMENSIONS.devices),
    loadDimension(client.clientId, fromDate, toDate, timezone, DIMENSIONS.sources)
  ])
  setHeader(event, 'Cache-Control', 'private, max-age=30, stale-while-revalidate=120')
  return {
    generatedAt: new Date().toISOString(),
    authority: {
      behavior: 'first_party_tracking',
      leadIntent: 'website_interaction',
      confirmedOutcome: 'provider_or_crm_confirmation',
      externalLiveCalls: false
    },
    dimensions: { pages, devices, sources }
  }
})
