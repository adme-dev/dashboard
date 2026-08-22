/**
 * Scheduled population of `campaign_creatives` (ad headlines/descriptions/primary text).
 *
 * Before this existed nothing wrote creatives on a schedule: `spendSync.syncCreatives` had no callers
 * and rows only appeared when a human opened a campaign-detail page. `get_ad_creative_text` now does a
 * read-through, but the offer-expiry sweep should not depend on per-call provider fetches.
 *
 * Sequential per connection, one failure never stops the others; Meta from Cloudflare may return
 * nothing on the development-access tier (same limitation as spend) — that is reported, not hidden.
 */
import { queryRows } from '~~/server/utils/db'
import { syncCreatives } from '~~/server/utils/spendSync'

export type CreativeSyncPlatform = 'meta' | 'google_ads'

export type CreativeSyncSummary = {
  period: string
  connections: number
  synced: number
  failures: Array<{ connectionId: string, platform: CreativeSyncPlatform, reason: string }>
}

export type CreativeSyncDeps = {
  listConnections: (platforms: CreativeSyncPlatform[], period: string) => Promise<Array<{ id: string, platform: CreativeSyncPlatform }>>
  syncOne: (platform: CreativeSyncPlatform, connectionId: string, month: number, year: number) => Promise<number>
}

const defaultDeps: CreativeSyncDeps = {
  // Only connections that actually have spend rows this period — nothing to attach creatives to otherwise.
  listConnections: (platforms, period) => queryRows<{ id: string, platform: CreativeSyncPlatform }>(
    `SELECT DISTINCT sc.id, sc.platform
       FROM social_connections sc
       JOIN media_spend ms ON ms.connection_id = sc.id AND ms.period = $2 AND ms.campaign_id IS NOT NULL
      WHERE sc.status = 'active' AND sc.platform = ANY($1::text[])
      ORDER BY sc.platform, sc.id`,
    [platforms, period]
  ),
  syncOne: (platform, connectionId, month, year) => syncCreatives(platform, connectionId, month, year)
}

export async function syncAllCampaignCreatives(
  month: number,
  year: number,
  platforms: CreativeSyncPlatform[] = ['google_ads', 'meta'],
  deps: CreativeSyncDeps = defaultDeps
): Promise<CreativeSyncSummary> {
  const period = `${year}-${String(month).padStart(2, '0')}`
  const connections = await deps.listConnections(platforms, period)
  const summary: CreativeSyncSummary = { period, connections: connections.length, synced: 0, failures: [] }
  for (const conn of connections) {
    try {
      summary.synced += await deps.syncOne(conn.platform, conn.id, month, year)
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err)
      summary.failures.push({ connectionId: conn.id, platform: conn.platform, reason })
      console.error(`[adCreativeSync] ${conn.platform} ${conn.id} failed: ${reason}`)
    }
  }
  console.log(`[adCreativeSync] ${period}: ${summary.synced} creatives across ${connections.length} connections, ${summary.failures.length} failure(s)`)
  return summary
}
