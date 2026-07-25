/**
 * Agency Funnel — staff-facing internal twin of the portal funnel.
 * GET /api/agency/analytics/funnel?clientId=&startDate=&endDate=
 */
import { queryRows } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'
import { buildClientCondition } from '~~/server/utils/analyticsMetrics'
import { buildFunnel, buildComparison, previousWindow } from '~~/server/utils/ga4Funnel'
import type { FunnelInput } from '~~/server/utils/ga4Funnel'
import { adPlatformToChannel, leadSourceToChannel } from '~~/server/utils/channelMap'

type Ga4Row = {
  channel: string
  sessions: string
  engaged: string
  key_events: string
  total_users: string
  new_users: string
  engagement_weighted: string
  duration_weighted: string
}

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const q = getQuery(event)
  const clientId = q.clientId as string
  const startDate = q.startDate as string
  const endDate = q.endDate as string
  if (!clientId || !startDate || !endDate) {
    throw createError({ statusCode: 400, statusMessage: 'clientId, startDate and endDate are required' })
  }

  // Aggregate spend + GA4 + leads into channel maps for a window.
  // Channel bucketing is done in JS via channelMap — the single source of truth.
  const aggregate = async (start: string, end: string): Promise<{ input: FunnelInput; ga4RowCount: number }> => {
    const spendRows = await queryRows<{ platform: string; spend: string }>(
      `SELECT ms.platform AS platform, COALESCE(SUM(ds.spend),0) AS spend
       FROM daily_spend ds
       JOIN media_spend ms ON ms.id = ds.media_spend_id
       WHERE ${buildClientCondition(1)} AND ds.spend_date BETWEEN $2 AND $3
       GROUP BY ms.platform`,
      [clientId, start, end]
    )
    const ga4Rows = await queryRows<Ga4Row>(
      `SELECT channel_group AS channel,
              COALESCE(SUM(sessions),0) AS sessions,
              COALESCE(SUM(engaged_sessions),0) AS engaged,
              COALESCE(SUM(key_events),0) AS key_events,
              COALESCE(SUM(total_users),0) AS total_users,
              COALESCE(SUM(new_users),0) AS new_users,
              COALESCE(SUM(engagement_rate * sessions),0) AS engagement_weighted,
              COALESCE(SUM(avg_session_duration * sessions),0) AS duration_weighted
       FROM ga4_daily_channel
       WHERE client_id = $1 AND metric_date BETWEEN $2 AND $3
       GROUP BY 1`,
      [clientId, start, end]
    )
    const leadRows = await queryRows<{ source: string; leads: string }>(
      `SELECT l.source AS source, COUNT(*) AS leads
       FROM leads l
       WHERE l.client_id = $1 AND l.deleted_at IS NULL
         AND l.source IN ('google', 'meta')
         AND l.submitted_at::date BETWEEN $2 AND $3
       GROUP BY l.source`,
      [clientId, start, end]
    )

    const spendByChannel: Record<string, number> = {}
    for (const r of spendRows) {
      const channel = adPlatformToChannel(r.platform) ?? 'Other'
      spendByChannel[channel] = (spendByChannel[channel] || 0) + Number(r.spend)
    }
    const ga4ByChannel: FunnelInput['ga4ByChannel'] = {}
    for (const r of ga4Rows) ga4ByChannel[r.channel] = {
      sessions: Number(r.sessions), engagedSessions: Number(r.engaged), keyEvents: Number(r.key_events),
      totalUsers: Number(r.total_users), newUsers: Number(r.new_users),
      engagementRateWeighted: Number(r.engagement_weighted), durationWeighted: Number(r.duration_weighted)
    }
    const leadsByChannel: Record<string, number> = {}
    for (const r of leadRows) {
      const channel = leadSourceToChannel(r.source)
      if (!channel) continue
      leadsByChannel[channel] = (leadsByChannel[channel] || 0) + Number(r.leads)
    }
    return { input: { spendByChannel, ga4ByChannel, leadsByChannel }, ga4RowCount: ga4Rows.length }
  }

  const current = await aggregate(startDate, endDate)
  const { prevStart, prevEnd } = previousWindow(startDate, endDate)
  const previous = await aggregate(prevStart, prevEnd)

  const funnel = buildFunnel(current.input)
  const prevFunnel = buildFunnel(previous.input)
  return {
    ...funnel,
    comparison: buildComparison(funnel.totals, prevFunnel.totals),
    // Raw previous-period totals for the agency funnel view (AnalyticsFunnelChart),
    // which computes its own deltas via funnelView. Additive — `comparison` stays
    // for any existing consumer.
    previous: { totals: prevFunnel.totals },
    hasGa4: current.ga4RowCount > 0
  }
})
