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
import { adPlatformToChannel, leadSourceToChannel } from '~~/server/utils/channelMap'

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

  // Spend by platform (daily_spend joined to media_spend, client-scoped).
  // Channel bucketing is done in JS via channelMap — the single source of truth.
  const spendRows = await queryRows<{ platform: string; spend: string }>(
    `SELECT ms.platform AS platform, COALESCE(SUM(ds.spend),0) AS spend
     FROM daily_spend ds
     JOIN media_spend ms ON ms.id = ds.media_spend_id
     WHERE ${buildClientCondition(1)} AND ds.spend_date BETWEEN $2 AND $3
     GROUP BY ms.platform`,
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

  // Portal-visible leads by source (bucketed in JS via channelMap).
  const leadRows = await queryRows<{ source: string; leads: string }>(
    `SELECT l.source AS source, COUNT(*) AS leads
     FROM leads l
     WHERE l.client_id = $1
       AND l.deleted_at IS NULL
       AND l.source IN ('google', 'meta')
       AND l.submitted_at::date BETWEEN $2 AND $3
       AND ${PORTAL_VISIBLE_LEADS_EXISTS}
     GROUP BY l.source`,
    [clientId, startDate, endDate]
  )

  const spendByChannel: Record<string, number> = {}
  for (const r of spendRows) {
    const channel = adPlatformToChannel(r.platform) ?? 'Other'
    spendByChannel[channel] = (spendByChannel[channel] || 0) + Number(r.spend)
  }

  const ga4ByChannel: Record<string, { sessions: number; engagedSessions: number; keyEvents: number }> = {}
  for (const r of ga4Rows) {
    ga4ByChannel[r.channel] = {
      sessions: Number(r.sessions),
      engagedSessions: Number(r.engaged),
      keyEvents: Number(r.key_events)
    }
  }

  const leadsByChannel: Record<string, number> = {}
  for (const r of leadRows) {
    const channel = leadSourceToChannel(r.source)
    if (!channel) continue
    leadsByChannel[channel] = (leadsByChannel[channel] || 0) + Number(r.leads)
  }

  const funnel = buildFunnel({ spendByChannel, ga4ByChannel, leadsByChannel })
  const hasGa4 = ga4Rows.length > 0
  return { ...funnel, hasGa4 }
})
