import { queryOne, execute } from '~~/server/utils/db'
import { getCampaignInsights } from '~~/server/utils/metaClient'

/**
 * Re-pull ONE campaign's month-to-date core metrics and update its media_spend row.
 * Single platform call (not the multi-account fan-out that rate-limits Meta).
 * Meta only for now; Google returns refreshed:false with a reason (the MCC
 * login-customer-id read bug is unresolved — see budget-health memory).
 */
export async function refreshSingleCampaignSpend(mediaSpendId: string): Promise<{ refreshed: boolean, error?: string }> {
  const row = await queryOne<{
    platform: 'meta' | 'google_ads'
    campaign_id: string | null
    account_id: string | null
    access_token: string | null
    period: string
  }>(
    `SELECT ms.platform, ms.campaign_id, sc.account_id, sc.access_token, ms.period
       FROM media_spend ms
       JOIN social_connections sc ON sc.id = ms.connection_id
      WHERE ms.id = $1`,
    [mediaSpendId],
  )
  if (!row || !row.campaign_id || !row.account_id || !row.access_token) {
    return { refreshed: false, error: 'missing connection or campaign' }
  }
  if (row.platform !== 'meta') {
    return { refreshed: false, error: 'live refresh supported for Meta only' }
  }

  const [year, month] = row.period.split('-').map(Number)
  try {
    const insights = await getCampaignInsights(`act_${row.account_id}`, row.access_token, month, year)
    const match = insights.find(i => i.campaign_id === row.campaign_id)
    if (!match) return { refreshed: false, error: 'campaign not in insights' }
    await execute(
      `UPDATE media_spend
          SET actual_spend = $2, impressions = $3, clicks = $4, synced_at = NOW()
        WHERE id = $1`,
      [mediaSpendId, Number(match.spend || 0), Number(match.impressions || 0), Number(match.clicks || 0)],
    )
    return { refreshed: true }
  } catch (err: any) {
    return { refreshed: false, error: (err?.data?.error?.message || err?.message || 'refresh failed').slice(0, 300) }
  }
}
