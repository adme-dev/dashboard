import { requireAuth } from '~~/server/utils/auth'
import { queryRows } from '~~/server/utils/db'
import { cachedFetch } from '~~/server/utils/kv'
import { classifyConnectionHealth, type ConnectionHealth } from '~~/server/utils/connectionHealth'

/**
 * GET /api/agency/social/connections/health-summary
 *
 * Per-platform aggregate of connection health for the Connection Health
 * Strip on /agency/social/spend. Cached 60s in KV — same data is also
 * available row-by-row via /api/agency/social/connections.
 */
const SEVERITY_ORDER: ConnectionHealth[] = [
  'error',
  'expired',
  'expiring_soon',
  'never_synced',
  'stale_sync',
  'healthy',
]

interface PlatformSummary {
  total: number
  healthy: number
  expiring_soon: number
  expired: number
  stale_sync: number
  never_synced: number
  error: number
  worst_status: ConnectionHealth
}

export default eventHandler(async (event) => {
  await requireAuth(event)

  return cachedFetch(event, 'spend:health-summary', 60, async () => {
    const rows = await queryRows<{
      platform: string
      status: string
      token_expires_at: string | null
      refresh_token: string | null
      last_synced_at: string | null
    }>(
      `SELECT sc.platform, sc.status, sc.token_expires_at, sc.refresh_token,
              (SELECT MAX(ms.synced_at) FROM media_spend ms WHERE ms.connection_id = sc.id) as last_synced_at
       FROM social_connections sc`
    )

    const out: Record<string, PlatformSummary> = {}

    for (const row of rows) {
      const platform = row.platform
      if (!out[platform]) {
        out[platform] = {
          total: 0, healthy: 0, expiring_soon: 0, expired: 0,
          stale_sync: 0, never_synced: 0, error: 0,
          worst_status: 'healthy',
        }
      }
      const summary = out[platform]
      const { health } = classifyConnectionHealth({
        status: row.status,
        tokenExpiresAt: row.token_expires_at,
        refreshToken: row.refresh_token,
        lastSyncedAt: row.last_synced_at,
      })
      summary.total += 1
      summary[health] += 1

      // worst_status = whichever has lower (worse) index in SEVERITY_ORDER
      if (SEVERITY_ORDER.indexOf(health) < SEVERITY_ORDER.indexOf(summary.worst_status)) {
        summary.worst_status = health
      }
    }

    return out
  })
})
