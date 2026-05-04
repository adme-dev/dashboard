import { requireAuth } from '~~/server/utils/auth'
import { queryRows } from '~~/server/utils/db'
import { cachedFetch } from '~~/server/utils/kv'

export default eventHandler(async (event) => {
  await requireAuth(event)
  const query = getQuery(event)
  const now = new Date()
  const month = parseInt(String(query.month || now.getMonth() + 1), 10)
  const year = parseInt(String(query.year || now.getFullYear()), 10)
  const period = `${year}-${String(month).padStart(2, '0')}`
  const rawPlatform = query.platform ? String(query.platform) : null
  const platform = rawPlatform === 'google' ? 'google_ads' : rawPlatform

  const emptyResult = { month, year, platform: platform || 'all', items: [], totals: { budget: 0, spend: 0, commission: 0, variance: 0 } }

  const cacheKey = `spend:summary:${period}:${platform || 'all'}`

  return cachedFetch(event, cacheKey, 300, async () => {
  try {
    let sql = `
      SELECT
        ms.platform,
        COALESCE(ac.name, ms.campaign_name, 'Unknown') as client_name,
        ac.xero_contact_id as client_ref,
        SUM(ms.budget_allocated) as total_budget,
        SUM(ms.actual_spend) as total_spend,
        SUM(ms.commission_amount) as total_commission,
        SUM(COALESCE(ms.impressions, 0)) as total_impressions,
        SUM(COALESCE(ms.clicks, 0)) as total_clicks,
        SUM(COALESCE(ms.conversions, 0)) as total_conversions,
        COUNT(*)::int as campaign_count,
        MAX(ms.synced_at) as last_synced_at,
        array_agg(ms.id ORDER BY ms.actual_spend DESC) as spend_ids,
        bool_or(COALESCE(ms.budget_rolling, false)) as is_rolling,
        MAX(ms.commission_rate) as commission_rate
      FROM media_spend ms
      LEFT JOIN agency_clients ac ON ms.client_id = ac.id
      WHERE ms.period = $1
    `
    const params: any[] = [period]

    if (platform && platform !== 'all') {
      sql += ` AND ms.platform = $${params.length + 1}`
      params.push(platform)
    }

    sql += ` GROUP BY ms.platform, ac.name, ac.xero_contact_id, ms.campaign_name ORDER BY total_spend DESC`

    const rows = await queryRows<any>(sql, params)

    const summary = rows.map((r: any) => {
      const budget = parseFloat(r.total_budget) || 0
      const spend = parseFloat(r.total_spend) || 0
      const variance = budget > 0 ? spend - budget : 0
      const variancePercent = budget > 0 ? ((spend - budget) / budget) * 100 : 0

      return {
        platform: r.platform,
        clientName: r.client_name,
        clientCode: r.client_ref || null,
        budget,
        spend,
        commission: parseFloat(r.total_commission) || 0,
        variance,
        variancePercent: Math.round(variancePercent * 10) / 10,
        impressions: parseInt(r.total_impressions) || 0,
        clicks: parseInt(r.total_clicks) || 0,
        conversions: parseInt(r.total_conversions) || 0,
        campaignCount: r.campaign_count,
        spendIds: r.spend_ids || [],
        rolling: r.is_rolling || false,
        commissionRate: parseFloat(r.commission_rate) || 0,
        lastSyncedAt: r.last_synced_at || null,
      }
    })

    const totals = {
      budget: summary.reduce((s, r) => s + r.budget, 0),
      spend: summary.reduce((s, r) => s + r.spend, 0),
      commission: summary.reduce((s, r) => s + r.commission, 0),
      variance: summary.reduce((s, r) => s + r.variance, 0),
    }

    const lastSyncedAt = rows.reduce((latest: string | null, r: any) => {
      if (!r.last_synced_at) return latest
      if (!latest) return r.last_synced_at
      return r.last_synced_at > latest ? r.last_synced_at : latest
    }, null as string | null)

    return { month, year, platform: platform || 'all', items: summary, totals, lastSyncedAt }
  } catch (err: any) {
    // Table may not exist if migrations haven't been run
    if (err.message?.includes('does not exist') || err.code === '42P01') {
      return emptyResult
    }
    throw err
  }
  }) // end cachedFetch
})
