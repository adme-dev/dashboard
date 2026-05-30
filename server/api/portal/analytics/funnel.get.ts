/**
 * Portal Funnel — client-scoped
 * GET /api/portal/analytics/funnel?startDate=&endDate=
 * Joins ad spend + GA4 channel metrics + owned (portal-visible) leads at GA4
 * channel grain. Channel mapping in SQL must match server/utils/channelMap.ts.
 */
import { queryRows } from '~~/server/utils/db'
import { requireClientAuth } from '~~/server/utils/clientAuth'
import { buildClientCondition } from '~~/server/utils/analyticsMetrics'
import { PORTAL_VISIBLE_LEADS_EXISTS } from '~~/server/utils/leads/portalAnalytics'
import { buildFunnel } from '~~/server/utils/ga4Funnel'

const SPEND_CHANNEL_CASE = `CASE
  WHEN ms.platform IN ('google_ads','google') THEN 'Paid Search'
  WHEN ms.platform IN ('meta','meta_ads') THEN 'Paid Social'
  ELSE 'Other' END`

const LEAD_CHANNEL_CASE = `CASE
  WHEN l.source = 'google' THEN 'Paid Search'
  WHEN l.source = 'meta' THEN 'Paid Social'
  ELSE 'Other' END`

export default defineEventHandler(async (event) => {
  const clientUser = await requireClientAuth(event)
  if (!clientUser.permissions.canViewAnalytics) {
    throw createError({ statusCode: 403, statusMessage: 'Analytics access not enabled' })
  }
  const clientId = clientUser.clientId
  const q = getQuery(event)
  const startDate = q.startDate as string
  const endDate = q.endDate as string
  if (!startDate || !endDate) {
    throw createError({ statusCode: 400, statusMessage: 'startDate and endDate are required' })
  }

  // Spend by channel (daily_spend joined to media_spend, client-scoped).
  const spendRows = await queryRows<{ channel: string; spend: string }>(
    `SELECT ${SPEND_CHANNEL_CASE} AS channel, COALESCE(SUM(ds.spend),0) AS spend
     FROM daily_spend ds
     JOIN media_spend ms ON ms.id = ds.media_spend_id
     WHERE ${buildClientCondition(1)} AND ds.spend_date BETWEEN $2 AND $3
     GROUP BY 1`,
    [clientId, startDate, endDate]
  )

  // GA4 metrics by channel.
  const ga4Rows = await queryRows<{ channel: string; sessions: string; engaged: string; key_events: string }>(
    `SELECT channel_group AS channel,
            COALESCE(SUM(sessions),0) AS sessions,
            COALESCE(SUM(engaged_sessions),0) AS engaged,
            COALESCE(SUM(key_events),0) AS key_events
     FROM ga4_daily_channel
     WHERE client_id = $1 AND metric_date BETWEEN $2 AND $3
     GROUP BY 1`,
    [clientId, startDate, endDate]
  )

  // Portal-visible leads by channel.
  const leadRows = await queryRows<{ channel: string; leads: string }>(
    `SELECT ${LEAD_CHANNEL_CASE} AS channel, COUNT(*) AS leads
     FROM leads l
     WHERE l.client_id = $1
       AND l.deleted_at IS NULL
       AND l.source IN ('google', 'meta')
       AND l.submitted_at::date BETWEEN $2 AND $3
       AND ${PORTAL_VISIBLE_LEADS_EXISTS}
     GROUP BY 1`,
    [clientId, startDate, endDate]
  )

  const spendByChannel: Record<string, number> = {}
  for (const r of spendRows) spendByChannel[r.channel] = Number(r.spend)

  const ga4ByChannel: Record<string, { sessions: number; engagedSessions: number; keyEvents: number }> = {}
  for (const r of ga4Rows) {
    ga4ByChannel[r.channel] = {
      sessions: Number(r.sessions),
      engagedSessions: Number(r.engaged),
      keyEvents: Number(r.key_events)
    }
  }

  const leadsByChannel: Record<string, number> = {}
  for (const r of leadRows) leadsByChannel[r.channel] = Number(r.leads)

  const funnel = buildFunnel({ spendByChannel, ga4ByChannel, leadsByChannel })
  const hasGa4 = ga4Rows.length > 0
  return { ...funnel, hasGa4 }
})
