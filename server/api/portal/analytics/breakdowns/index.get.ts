/**
 * Portal Analytics Breakdowns — client-scoped
 * GET /api/portal/analytics/breakdowns
 *
 * Query params: campaignId (media_spend.id), dimensionType? (age|gender|device|geo|placement|hourly)
 */
import { queryRows, queryOne } from '~~/server/utils/db'
import { requireClientAuth } from '~~/server/utils/clientAuth'
import { computeMetrics, toNum, buildClientCondition } from '~~/server/utils/analyticsMetrics'

// Only platforms with breakdown sync support (see onDemandSync.ts)
const SUPPORTED_PLATFORMS = ['meta', 'google_ads']
const VALID_DIMENSIONS = ['age', 'gender', 'device', 'geo', 'placement', 'hourly', 'city', 'region', 'device_model', 'story_type']

export default defineEventHandler(async (event) => {
  const clientUser = await requireClientAuth(event)

  if (!clientUser.permissions.canViewAnalytics) {
    throw createError({ statusCode: 403, statusMessage: 'Analytics access not enabled' })
  }

  const q = getQuery(event)
  const campaignId = q.campaignId as string
  if (!campaignId) {
    throw createError({ statusCode: 400, statusMessage: 'campaignId is required' })
  }

  const dimensionType = q.dimensionType as string | undefined
  if (dimensionType && !VALID_DIMENSIONS.includes(dimensionType)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid dimensionType' })
  }

  try {
    // Verify the media_spend belongs to this client
    const spend = await queryOne<{ id: string; platform: string }>(
      `SELECT ms.id, ms.platform FROM media_spend ms WHERE ms.id = $1 AND ${buildClientCondition(2)}`,
      [campaignId, clientUser.clientId]
    )

    if (!spend) {
      throw createError({ statusCode: 404, statusMessage: 'Campaign not found' })
    }

    const hasBreakdowns = SUPPORTED_PLATFORMS.includes(spend.platform)

    // Try fetching extra metric columns (graceful if migration 041 not yet applied)
    let extraMetrics: Record<string, any> = {
      frequency: null, reach: null, landingPageViews: null,
      videoViews: null, videoThruplay: null,
      impressionShare: null, lostImpressionShareBudget: null, lostImpressionShareRank: null,
      qualityRanking: null, engagementRateRanking: null, conversionRateRanking: null,
      engagements: null, interactions: null, interactionRate: null,
      postReactions: null, postComments: null, postShares: null, linkClicks: null, postSaves: null,
      videoP25Rate: null, videoP50Rate: null, videoP75Rate: null, videoP100Rate: null,
      searchAbsoluteTopIs: null, searchClickShare: null,
      costPerResult: null, resultType: null,
    }
    try {
      const em = await queryOne<any>(
        `SELECT ms.frequency, ms.reach, ms.landing_page_views, ms.video_views, ms.video_thruplay,
                ms.impression_share, ms.lost_impression_share_budget, ms.lost_impression_share_rank,
                ms.quality_ranking, ms.engagement_rate_ranking, ms.conversion_rate_ranking,
                ms.engagements, ms.interactions, ms.interaction_rate,
                ms.post_reactions, ms.post_comments, ms.post_shares, ms.link_clicks, ms.post_saves,
                ms.video_p25_rate, ms.video_p50_rate, ms.video_p75_rate, ms.video_p100_rate,
                ms.search_absolute_top_is, ms.search_click_share,
                ms.cost_per_result, ms.result_type
         FROM media_spend ms WHERE ms.id = $1`,
        [campaignId]
      )
      if (em) {
        extraMetrics = {
          frequency: em.frequency != null ? toNum(em.frequency) : null,
          reach: em.reach != null ? toNum(em.reach) : null,
          landingPageViews: em.landing_page_views != null ? toNum(em.landing_page_views) : null,
          videoViews: em.video_views != null ? toNum(em.video_views) : null,
          videoThruplay: em.video_thruplay != null ? toNum(em.video_thruplay) : null,
          impressionShare: em.impression_share != null ? toNum(em.impression_share) : null,
          lostImpressionShareBudget: em.lost_impression_share_budget != null ? toNum(em.lost_impression_share_budget) : null,
          lostImpressionShareRank: em.lost_impression_share_rank != null ? toNum(em.lost_impression_share_rank) : null,
          qualityRanking: em.quality_ranking || null,
          engagementRateRanking: em.engagement_rate_ranking || null,
          conversionRateRanking: em.conversion_rate_ranking || null,
          engagements: em.engagements != null ? toNum(em.engagements) : null,
          interactions: em.interactions != null ? toNum(em.interactions) : null,
          interactionRate: em.interaction_rate != null ? toNum(em.interaction_rate) : null,
          postReactions: em.post_reactions != null ? toNum(em.post_reactions) : null,
          postComments: em.post_comments != null ? toNum(em.post_comments) : null,
          postShares: em.post_shares != null ? toNum(em.post_shares) : null,
          linkClicks: em.link_clicks != null ? toNum(em.link_clicks) : null,
          postSaves: em.post_saves != null ? toNum(em.post_saves) : null,
          videoP25Rate: em.video_p25_rate != null ? toNum(em.video_p25_rate) : null,
          videoP50Rate: em.video_p50_rate != null ? toNum(em.video_p50_rate) : null,
          videoP75Rate: em.video_p75_rate != null ? toNum(em.video_p75_rate) : null,
          videoP100Rate: em.video_p100_rate != null ? toNum(em.video_p100_rate) : null,
          searchAbsoluteTopIs: em.search_absolute_top_is != null ? toNum(em.search_absolute_top_is) : null,
          searchClickShare: em.search_click_share != null ? toNum(em.search_click_share) : null,
          costPerResult: em.cost_per_result != null ? toNum(em.cost_per_result) : null,
          resultType: em.result_type || null,
        }
      }
    } catch {
      // Migration 041 not applied yet — extra metric columns don't exist
    }

    if (!hasBreakdowns) {
      return {
        campaignId,
        platform: spend.platform,
        breakdowns: { age: [], gender: [], device: [], geo: [], placement: [], hourly: [], city: [], region: [], device_model: [], story_type: [] },
        hasBreakdowns: false,
        extraMetrics,
      }
    }

    const conditions = ['sb.media_spend_id = $1']
    const params: any[] = [campaignId]
    if (dimensionType) {
      conditions.push('sb.dimension_type = $2')
      params.push(dimensionType)
    }

    const rows = await queryRows<{
      dimension_type: string
      dimension_value: string
      spend: string
      impressions: string
      clicks: string
      conversions: string
      revenue: string
    }>(`
      SELECT dimension_type, dimension_value, spend, impressions, clicks, conversions, revenue
      FROM spend_breakdowns sb
      WHERE ${conditions.join(' AND ')}
      ORDER BY dimension_type, spend DESC
    `, params)

    const breakdowns: Record<string, any[]> = { age: [], gender: [], device: [], geo: [], placement: [], hourly: [], city: [], region: [], device_model: [], story_type: [] }

    for (const r of rows) {
      const spendVal = toNum(r.spend)
      const impressions = toNum(r.impressions)
      const clicks = toNum(r.clicks)
      const conversions = toNum(r.conversions)
      const revenue = toNum(r.revenue)
      const metrics = computeMetrics(spendVal, impressions, clicks, conversions, revenue)

      const entry = {
        dimensionValue: r.dimension_value,
        spend: spendVal,
        impressions,
        clicks,
        conversions,
        ctr: metrics.ctr,
        cpc: metrics.cpc,
      }

      if (breakdowns[r.dimension_type]) {
        breakdowns[r.dimension_type].push(entry)
      }
    }

    // Sort hourly by hour ascending
    if (breakdowns.hourly.length > 0) {
      breakdowns.hourly.sort((a: any, b: any) => parseInt(a.dimensionValue) - parseInt(b.dimensionValue))
    }

    return {
      campaignId,
      platform: spend.platform,
      breakdowns,
      hasBreakdowns: true,
      extraMetrics,
    }
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Portal analytics breakdowns failed:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to fetch breakdowns' })
  }
})
