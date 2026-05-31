/**
 * Agency Funnel — staff-facing internal twin of the portal funnel.
 * GET /api/agency/analytics/funnel?clientId=&startDate=&endDate=
 */
import { queryRows } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'
import { buildClientCondition } from '~~/server/utils/analyticsMetrics'
import { buildFunnel } from '~~/server/utils/ga4Funnel'
import { adPlatformToChannel, leadSourceToChannel } from '~~/server/utils/channelMap'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const q = getQuery(event)
  const clientId = q.clientId as string
  const startDate = q.startDate as string
  const endDate = q.endDate as string
  if (!clientId || !startDate || !endDate) {
    throw createError({ statusCode: 400, statusMessage: 'clientId, startDate and endDate are required' })
  }

  // Channel bucketing is done in JS via channelMap — the single source of truth.
  const spendRows = await queryRows<{ platform: string; spend: string }>(
    `SELECT ms.platform AS platform, COALESCE(SUM(ds.spend),0) AS spend
     FROM daily_spend ds
     JOIN media_spend ms ON ms.id = ds.media_spend_id
     WHERE ${buildClientCondition(1)} AND ds.spend_date BETWEEN $2 AND $3
     GROUP BY ms.platform`,
    [clientId, startDate, endDate]
  )
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
  const leadRows = await queryRows<{ source: string; leads: string }>(
    `SELECT l.source AS source, COUNT(*) AS leads
     FROM leads l
     WHERE l.client_id = $1 AND l.deleted_at IS NULL
       AND l.source IN ('google', 'meta')
       AND l.submitted_at::date BETWEEN $2 AND $3
     GROUP BY l.source`,
    [clientId, startDate, endDate]
  )

  const spendByChannel: Record<string, number> = {}
  for (const r of spendRows) {
    const channel = adPlatformToChannel(r.platform) ?? 'Other'
    spendByChannel[channel] = (spendByChannel[channel] || 0) + Number(r.spend)
  }
  const ga4ByChannel: Record<string, { sessions: number; engagedSessions: number; keyEvents: number }> = {}
  for (const r of ga4Rows) ga4ByChannel[r.channel] = { sessions: Number(r.sessions), engagedSessions: Number(r.engaged), keyEvents: Number(r.key_events) }
  const leadsByChannel: Record<string, number> = {}
  for (const r of leadRows) {
    const channel = leadSourceToChannel(r.source)
    if (!channel) continue
    leadsByChannel[channel] = (leadsByChannel[channel] || 0) + Number(r.leads)
  }

  const funnel = buildFunnel({ spendByChannel, ga4ByChannel, leadsByChannel })
  return { ...funnel, hasGa4: ga4Rows.length > 0 }
})
