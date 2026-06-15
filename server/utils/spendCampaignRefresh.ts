import { queryOne, execute } from '~~/server/utils/db'
import { getCampaignInsightsById } from '~~/server/utils/metaClient'

/**
 * Re-pull ONE campaign's month-to-date core metrics and update its media_spend row.
 * Single Graph call to the campaign node directly (no account-wide fan-out or
 * pagination — avoids the burst pattern the jobs-consumer throttle was added to
 * suppress, and needs no ad-account id / metadata.actId). Meta only for now;
 * Google returns refreshed:false (the MCC login-customer-id read bug is unresolved).
 */
export async function refreshSingleCampaignSpend(mediaSpendId: string): Promise<{ refreshed: boolean, error?: string }> {
  const row = await queryOne<{
    platform: 'meta' | 'google_ads'
    campaign_id: string | null
    access_token: string | null
    period: string
  }>(
    `SELECT ms.platform, ms.campaign_id, sc.access_token, ms.period
       FROM media_spend ms
       JOIN social_connections sc ON sc.id = ms.connection_id
      WHERE ms.id = $1`,
    [mediaSpendId],
  )
  if (!row || !row.campaign_id || !row.access_token) {
    return { refreshed: false, error: 'missing connection or campaign' }
  }
  if (row.platform !== 'meta') {
    return { refreshed: false, error: 'live refresh supported for Meta only' }
  }

  const [year, month] = row.period.split('-').map(Number)
  try {
    const match = await getCampaignInsightsById(row.campaign_id, row.access_token, month, year)
    if (!match) return { refreshed: false, error: 'campaign not in insights' }
    const spend = Number(match.spend)
    const impressions = Number(match.impressions)
    const clicks = Number(match.clicks)
    // Don't write NaN into numeric columns if Graph returns a malformed value.
    if (!Number.isFinite(spend) || !Number.isFinite(impressions) || !Number.isFinite(clicks)) {
      return { refreshed: false, error: 'non-numeric insights value' }
    }
    await execute(
      `UPDATE media_spend
          SET actual_spend = $2, impressions = $3, clicks = $4, synced_at = NOW()
        WHERE id = $1`,
      [mediaSpendId, spend, impressions, clicks],
    )
    return { refreshed: true }
  } catch (err: any) {
    return { refreshed: false, error: (err?.data?.error?.message || err?.message || 'refresh failed').slice(0, 300) }
  }
}
