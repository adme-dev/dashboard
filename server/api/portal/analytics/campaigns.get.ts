/**
 * Portal Analytics Campaigns — client-scoped
 * GET /api/portal/analytics/campaigns
 *
 * Query params: startDate, endDate, platform?, sortBy, sortDir, limit, offset, search?
 */
import { queryRows, queryOne } from '~~/server/utils/db'
import { requireClientAuth } from '~~/server/utils/clientAuth'
import { computeMetrics, toNum, PLATFORM_LABELS, PLATFORM_COLORS, buildClientCondition } from '~~/server/utils/analyticsMetrics'
import {
  PORTAL_LEAD_STATUS_SELECT,
  PORTAL_VISIBLE_LEADS_EXISTS,
  leadSourceForPlatformSql
} from '~~/server/utils/leads/portalAnalytics'

const ALLOWED_SORT = ['spend', 'impressions', 'clicks', 'conversions', 'revenue', 'campaign_name', 'platform', 'lead_count', 'cost_per_lead'] as const

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

  const platforms = q.platform ? String(q.platform).split(',').map(p => p.trim()).filter(Boolean) : null
  const requestedSort = String(q.sortBy || '')
  const sortBy = ALLOWED_SORT.includes(requestedSort as typeof ALLOWED_SORT[number])
    ? requestedSort
    : 'spend'
  const sortDir = q.sortDir === 'asc' ? 'ASC' : 'DESC'
  const limit = Math.min(Math.max(Number(q.limit) || 50, 1), 200)
  const offset = Math.max(Number(q.offset) || 0, 0)
  const search = q.search as string | undefined

  const conditions: string[] = ['ms.period >= $1', 'ms.period <= $2', buildClientCondition(3)]
  const params: unknown[] = [startDate.slice(0, 7), endDate.slice(0, 7), clientId]
  let idx = 4

  if (platforms && platforms.length > 0) {
    conditions.push(`ms.platform = ANY($${idx})`)
    params.push(platforms)
    idx++
  }
  if (search) {
    const escaped = String(search).replace(/%/g, '\\%').replace(/_/g, '\\_')
    conditions.push(`ms.campaign_name ILIKE $${idx}`)
    params.push(`%${escaped}%`)
    idx++
  }

  const where = conditions.join(' AND ')

  try {
    const countResult = await queryOne(`
      SELECT COUNT(DISTINCT ms.campaign_id) as count
      FROM media_spend ms
      WHERE ${where}
    `, params)
    const total = Number(countResult?.count || 0)

    params.push(startDate)
    const leadStartIdx = idx
    idx++
    params.push(endDate)
    const leadEndIdx = idx
    idx++
    params.push(limit)
    const limitIdx = idx
    idx++
    params.push(offset)
    const offsetIdx = idx

    const rows = await queryRows(`
      WITH campaigns AS (
        SELECT
          ms.campaign_id,
          ms.campaign_name,
          ms.platform,
          ms.campaign_type,
          ms.campaign_status,
          SUM(ms.actual_spend) as spend,
          SUM(ms.impressions) as impressions,
          SUM(ms.clicks) as clicks,
          SUM(ms.conversions) as conversions,
          COALESCE(SUM(ms.revenue), 0) as revenue,
          (array_agg(ms.id ORDER BY ms.synced_at DESC NULLS LAST))[1] as media_spend_id
        FROM media_spend ms
        WHERE ${where}
        GROUP BY ms.campaign_id, ms.campaign_name, ms.platform, ms.campaign_type, ms.campaign_status
      )
      SELECT
        c.*,
        COALESCE(la.lead_count, 0) AS lead_count,
        COALESCE(la.lead_new_count, 0) AS lead_new_count,
        COALESCE(la.lead_contacted_count, 0) AS lead_contacted_count,
        COALESCE(la.lead_qualified_count, 0) AS lead_qualified_count,
        COALESCE(la.lead_won_count, 0) AS lead_won_count,
        COALESCE(la.lead_lost_count, 0) AS lead_lost_count,
        CASE WHEN COALESCE(la.lead_count, 0) > 0 THEN c.spend / la.lead_count ELSE NULL END AS cost_per_lead
      FROM campaigns c
      LEFT JOIN LATERAL (
        SELECT ${PORTAL_LEAD_STATUS_SELECT}
        FROM leads l
        WHERE l.client_id = $3
          AND l.deleted_at IS NULL
          AND l.submitted_at >= $${leadStartIdx}::date
          AND l.submitted_at < ($${leadEndIdx}::date + INTERVAL '1 day')
          AND l.source = ${leadSourceForPlatformSql('c')}
          AND (
            (c.campaign_id IS NOT NULL AND l.campaign_id = c.campaign_id)
            OR (c.campaign_id IS NULL AND c.campaign_name IS NOT NULL AND l.campaign_name = c.campaign_name)
          )
          AND ${PORTAL_VISIBLE_LEADS_EXISTS}
      ) la ON TRUE
      ORDER BY ${sortBy === 'cost_per_lead' ? 'cost_per_lead' : sortBy} ${sortDir} NULLS LAST
      LIMIT $${limitIdx} OFFSET $${offsetIdx}
    `, params)

    const campaigns = rows.map((r) => {
      const spend = toNum(r.spend)
      const impressions = toNum(r.impressions)
      const clicks = toNum(r.clicks)
      const conversions = toNum(r.conversions)
      const revenue = toNum(r.revenue)
      const metrics = computeMetrics(spend, impressions, clicks, conversions, revenue)

      return {
        campaignId: r.campaign_id,
        campaignName: r.campaign_name,
        platform: r.platform,
        platformDisplayName: PLATFORM_LABELS[r.platform] || r.platform,
        platformColor: PLATFORM_COLORS[r.platform] || '#888888',
        campaignType: r.campaign_type,
        campaignStatus: r.campaign_status,
        spend,
        impressions,
        clicks,
        conversions,
        revenue,
        ...metrics,
        leadCount: Number(r.lead_count || 0),
        leadNewCount: Number(r.lead_new_count || 0),
        leadContactedCount: Number(r.lead_contacted_count || 0),
        leadQualifiedCount: Number(r.lead_qualified_count || 0),
        leadWonCount: Number(r.lead_won_count || 0),
        leadLostCount: Number(r.lead_lost_count || 0),
        costPerLead: r.cost_per_lead == null ? null : toNum(r.cost_per_lead),
        mediaSpendId: r.media_spend_id
      }
    })

    return { campaigns, total, limit, offset }
  } catch (error) {
    console.error('Portal analytics campaigns failed:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to fetch campaigns' })
  }
})
