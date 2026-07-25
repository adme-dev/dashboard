/**
 * Portal Funnel — client-scoped
 * GET /api/portal/analytics/funnel?startDate=&endDate=
 * Optional query params: platform?, runningOnly
 * Joins ad spend + GA4 channel metrics + owned (portal-visible) leads at GA4
 * channel grain. Channel mapping in SQL must match server/utils/channelMap.ts.
 */
import { queryOne, queryRows } from '~~/server/utils/db'
import { requireClientAuth } from '~~/server/utils/clientAuth'
import { buildClientCondition } from '~~/server/utils/analyticsMetrics'
import { PORTAL_VISIBLE_LEADS_EXISTS } from '~~/server/utils/leads/portalAnalytics'
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
  const clientUser = await requireClientAuth(event)
  if (!clientUser.permissions.canViewAnalytics) {
    throw createError({ statusCode: 403, statusMessage: 'Analytics access not enabled' })
  }
  const clientId = clientUser.clientId
  const q = getQuery(event)
  const startDate = q.startDate as string
  const endDate = q.endDate as string
  const runningOnly = String(q.runningOnly || '').toLowerCase() === '1'
    || String(q.runningOnly || '').toLowerCase() === 'true'
  const platforms = q.platform ? String(q.platform).split(',').map(p => p.trim()).filter(Boolean) : null
  if (!startDate || !endDate) {
    throw createError({ statusCode: 400, statusMessage: 'startDate and endDate are required' })
  }
  const explicitPlatforms = platforms && platforms.length > 0
  let effectivePlatforms = explicitPlatforms ? [...platforms] : null
  if (runningOnly && !explicitPlatforms) {
    const hasMetaCampaigns = await queryOne<{ hasMetaCampaigns: boolean }>(`
      SELECT EXISTS (
        SELECT 1
        FROM media_spend ms
        WHERE ms.platform = 'meta'
          AND ms.period >= $1
          AND ms.period <= $2
          AND ${buildClientCondition(3)}
      ) AS "hasMetaCampaigns"
    `, [startDate.slice(0, 7), endDate.slice(0, 7), clientId])

    effectivePlatforms = ['google_ads']
    if (hasMetaCampaigns?.hasMetaCampaigns) {
      effectivePlatforms.push('meta')
    }
  }
  if (runningOnly && effectivePlatforms && effectivePlatforms.length > 0) {
    const normalized = effectivePlatforms.map((p) => p.trim()).filter(Boolean)
    if (normalized.length > 0) {
      effectivePlatforms.splice(0, effectivePlatforms.length, ...normalized)
    }
  }

  const ga4Channels = (effectivePlatforms && effectivePlatforms.length > 0)
    ? Array.from(new Set(
        effectivePlatforms
          .map((platform) => adPlatformToChannel(platform))
          .filter((channel): boolean => Boolean(channel))
      )) as string[]
    : null
  const leadSources = (effectivePlatforms && effectivePlatforms.length > 0)
    ? effectivePlatforms
      .map((platform) => (platform === 'google_ads' ? 'google' : platform === 'meta' ? 'meta' : null))
      .filter((source): boolean => Boolean(source))
      .map((source) => source as string)
    : null

  // Aggregate spend + GA4 + portal-visible leads into channel maps for a window.
  // Channel bucketing is done in JS via channelMap — the single source of truth.
  const aggregate = async (start: string, end: string): Promise<{ input: FunnelInput; ga4RowCount: number }> => {
    const spendConditions: string[] = ['ds.spend_date BETWEEN $2 AND $3', buildClientCondition(1)]
    const spendParams: unknown[] = [clientId, start, end]
    let spendIdx = 4

    if (effectivePlatforms && effectivePlatforms.length > 0) {
      spendConditions.push(`ms.platform = ANY($${spendIdx})`)
      spendParams.push(effectivePlatforms)
      spendIdx++
    }
    if (runningOnly && effectivePlatforms && effectivePlatforms.length > 0) {
      spendParams.push(['ACTIVE', 'ENABLED', 'DELIVERING', 'RUNNING'].map((s) => s.toUpperCase()))
      spendConditions.push(`(
        (ms.end_date IS NULL OR ms.end_date >= CURRENT_DATE)
        AND (
          ms.campaign_status IS NULL
          OR UPPER(ms.campaign_status) = ANY($${spendIdx}::text[])
        )
      )`)
      spendIdx++
    }

    const spendRows = await queryRows<{ platform: string; spend: string }>(
      `SELECT ms.platform AS platform, COALESCE(SUM(ds.spend),0) AS spend
       FROM daily_spend ds
       JOIN media_spend ms ON ms.id = ds.media_spend_id
       WHERE ${spendConditions.join(' AND ')}
       GROUP BY ms.platform`,
      spendParams
    )
    // engagement_rate / avg_session_duration are session-weighted so totals recover the average.
    const ga4Conditions = ['client_id = $1', 'metric_date BETWEEN $2 AND $3']
    const ga4Params: unknown[] = [clientId, start, end]
    let ga4Idx = 4
    if (ga4Channels && ga4Channels.length > 0) {
      ga4Conditions.push(`channel_group = ANY($${ga4Idx})`)
      ga4Params.push(ga4Channels)
      ga4Idx++
    }

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
       WHERE ${ga4Conditions.join(' AND ')}
       GROUP BY 1`,
      ga4Params
    )

    const leadConditions = [
      'l.client_id = $1',
      'l.deleted_at IS NULL',
      'l.submitted_at >= $2::date',
      `l.submitted_at < ($3::date + INTERVAL '1 day')`,
      PORTAL_VISIBLE_LEADS_EXISTS
    ]
    const leadParams: unknown[] = [clientId, start, end]
    if (leadSources && leadSources.length > 0) {
      leadConditions.push('l.source = ANY($4)')
      leadParams.push(leadSources)
    } else if (!runningOnly) {
      leadConditions.push(`l.source IN ('google', 'meta')`)
    }

    const leadRows = await queryRows<{ source: string; leads: string }>(
      `SELECT l.source AS source, COUNT(*) AS leads
       FROM leads l
       WHERE ${leadConditions.join(' AND ')}
       GROUP BY l.source`,
      leadParams
    )

    const spendByChannel: Record<string, number> = {}
    for (const r of spendRows) {
      const channel = adPlatformToChannel(r.platform) ?? 'Other'
      spendByChannel[channel] = (spendByChannel[channel] || 0) + Number(r.spend)
    }
    const ga4ByChannel: FunnelInput['ga4ByChannel'] = {}
    for (const r of ga4Rows) {
      ga4ByChannel[r.channel] = {
        sessions: Number(r.sessions),
        engagedSessions: Number(r.engaged),
        keyEvents: Number(r.key_events),
        totalUsers: Number(r.total_users),
        newUsers: Number(r.new_users),
        engagementRateWeighted: Number(r.engagement_weighted),
        durationWeighted: Number(r.duration_weighted)
      }
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
    hasGa4: current.ga4RowCount > 0
  }
})
