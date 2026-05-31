/**
 * Blended cross-channel metrics
 * GET /api/agency/analytics/blended?startDate=&endDate=&clientId=
 *
 * Returns blended CPL / CPA / ROAS per CANONICAL channel (channelTaxonomy.ts),
 * reconciling ad spend (daily_spend), GA4 sessions (ga4_daily_channel) and owned
 * leads on one axis. clientId is optional — omit for an agency-wide blend.
 *
 * Conversions/revenue are platform-reported; leads are first-party. See
 * server/utils/blendedMetrics.ts for the ratio + labelling semantics.
 */
import { queryRows } from '~~/server/utils/db'
import { requireRole } from '~~/server/utils/auth'
import { PERMISSIONS } from '~~/server/utils/permissions'
import { buildClientCondition } from '~~/server/utils/analyticsMetrics'
import { previousWindow } from '~~/server/utils/ga4Funnel'
import { resolveCanonicalChannel } from '~~/server/utils/channelTaxonomy'
import { cachedAnalytics, analyticsCacheKey } from '~~/server/utils/analyticsCache'
import {
  buildBlended,
  buildBlendedComparison,
  type BlendedInput
} from '~~/server/utils/blendedMetrics'

export default defineEventHandler(async (event) => {
  await requireRole(event, [...new Set([...PERMISSIONS.CLIENTS, ...PERMISSIONS.MEDIA_BUYING])])
  const q = getQuery(event)
  const startDate = q.startDate as string
  const endDate = q.endDate as string
  const clientId = (q.clientId as string) || undefined
  if (!startDate || !endDate) {
    throw createError({ statusCode: 400, statusMessage: 'startDate and endDate are required' })
  }

  // Aggregate one window into a canonical-channel BlendedInput.
  const aggregate = async (start: string, end: string): Promise<{ input: BlendedInput, ga4RowCount: number }> => {
    // --- Spend / conversions / revenue (daily grain), by platform ---
    const spendParams: unknown[] = clientId ? [clientId, start, end] : [start, end]
    const spendWhere = clientId
      ? `${buildClientCondition(1)} AND ds.spend_date BETWEEN $2 AND $3`
      : `ds.spend_date BETWEEN $1 AND $2`
    const spendRows = await queryRows<{ platform: string, spend: string, conversions: string, revenue: string }>(
      `SELECT ms.platform AS platform,
              COALESCE(SUM(ds.spend),0) AS spend,
              COALESCE(SUM(ds.conversions),0) AS conversions,
              COALESCE(SUM(ds.revenue),0) AS revenue
       FROM daily_spend ds
       JOIN media_spend ms ON ms.id = ds.media_spend_id
       WHERE ${spendWhere}
       GROUP BY ms.platform`,
      spendParams
    )

    // --- GA4 sessions, by channel group ---
    const ga4Params: unknown[] = clientId ? [clientId, start, end] : [start, end]
    const ga4Where = clientId
      ? `client_id = $1 AND metric_date BETWEEN $2 AND $3`
      : `metric_date BETWEEN $1 AND $2`
    const ga4Rows = await queryRows<{ channel: string, sessions: string }>(
      `SELECT channel_group AS channel, COALESCE(SUM(sessions),0) AS sessions
       FROM ga4_daily_channel
       WHERE ${ga4Where}
       GROUP BY channel_group`,
      ga4Params
    )

    // --- Owned leads, by source ---
    const leadParams: unknown[] = clientId ? [clientId, start, end] : [start, end]
    const leadWhere = clientId
      ? `l.client_id = $1 AND l.deleted_at IS NULL AND l.submitted_at::date BETWEEN $2 AND $3`
      : `l.deleted_at IS NULL AND l.submitted_at::date BETWEEN $1 AND $2`
    const leadRows = await queryRows<{ source: string, leads: string }>(
      `SELECT l.source AS source, COUNT(*) AS leads
       FROM leads l
       WHERE ${leadWhere}
       GROUP BY l.source`,
      leadParams
    )

    const spendByChannel: Record<string, number> = {}
    const conversionsByChannel: Record<string, number> = {}
    const revenueByChannel: Record<string, number> = {}
    for (const r of spendRows) {
      const ch = (await resolveCanonicalChannel('ad_platform', r.platform)) ?? 'Other'
      spendByChannel[ch] = (spendByChannel[ch] || 0) + Number(r.spend)
      conversionsByChannel[ch] = (conversionsByChannel[ch] || 0) + Number(r.conversions)
      revenueByChannel[ch] = (revenueByChannel[ch] || 0) + Number(r.revenue)
    }

    const sessionsByChannel: Record<string, number> = {}
    for (const r of ga4Rows) {
      const ch = (await resolveCanonicalChannel('ga4', r.channel)) ?? r.channel
      sessionsByChannel[ch] = (sessionsByChannel[ch] || 0) + Number(r.sessions)
    }

    const leadsByChannel: Record<string, number> = {}
    for (const r of leadRows) {
      const ch = (await resolveCanonicalChannel('lead_source', r.source)) ?? 'Other'
      leadsByChannel[ch] = (leadsByChannel[ch] || 0) + Number(r.leads)
    }

    return {
      input: { spendByChannel, leadsByChannel, conversionsByChannel, revenueByChannel, sessionsByChannel },
      ga4RowCount: ga4Rows.length
    }
  }

  const cacheKey = analyticsCacheKey('blended', { clientId, startDate, endDate })

  try {
    return await cachedAnalytics(event, cacheKey, { endDate }, async () => {
      const current = await aggregate(startDate, endDate)
      const { prevStart, prevEnd } = previousWindow(startDate, endDate)
      const previous = await aggregate(prevStart, prevEnd)

      const blended = buildBlended(current.input)
      const prevBlended = buildBlended(previous.input)

      return {
        ...blended,
        comparison: buildBlendedComparison(blended.totals, prevBlended.totals),
        hasGa4: current.ga4RowCount > 0,
        // Conversions/revenue are each ad platform's own counting, not deduped truth.
        conversionBasis: 'platform-reported'
      }
    })
  } catch (error) {
    console.error('Analytics blended failed:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to fetch blended metrics' })
  }
})
