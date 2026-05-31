/**
 * Meta ad status sync.
 *
 * Polls Meta for the live `effective_status` of each non-terminal ad we've
 * published and updates `banner_ad_publishes.status` to match. Without this the
 * row keeps whatever it was at creation time (`pending_review`) and never
 * reflects approval / rejection / pausing on the platform.
 *
 * Used by:
 *   - POST /api/cron/meta-ad-status-sync          (hourly Cloudflare trigger)
 *   - POST /api/agency/banner-studio/ad-publish/meta/sync-status  (UI refresh)
 */
import { queryRows, execute } from '~~/server/utils/db'
import { getAdStatus } from '~~/server/utils/metaClient'
import { mapMetaEffectiveStatus, NON_TERMINAL_STATUSES } from '~~/server/utils/metaAdStatus'

export interface SyncResult {
  checked: number
  updated: number
  skipped: number
  errors: number
}

interface PublishRow {
  id: string
  adId: string
  status: string
  accessToken: string | null
  tokenExpiresAt: string | null
}

/**
 * Sync Meta ad statuses for non-terminal rows.
 *
 * @param opts.projectId  Limit to one project (UI refresh). Omit for the global cron run.
 * @param opts.limit      Max rows per run (rate-limit guard). Default 100.
 */
export async function syncMetaAdStatuses(
  opts: { projectId?: string, limit?: number } = {}
): Promise<SyncResult> {
  const limit = opts.limit ?? 100
  const result: SyncResult = { checked: 0, updated: 0, skipped: 0, errors: 0 }

  // Join each publish row to its Meta connection via account_id. A token may be
  // absent (account disconnected) — those rows are skipped, not failed. Only
  // look back 30 days: older ads have settled and aren't worth the API spend.
  const rows = (await queryRows(
    `SELECT bap.id, bap.ad_id AS "adId", bap.status,
            sc.access_token AS "accessToken",
            sc.token_expires_at AS "tokenExpiresAt"
     FROM banner_ad_publishes bap
     LEFT JOIN LATERAL (
       SELECT access_token, token_expires_at
       FROM social_connections
       WHERE account_id = bap.account_id
         AND platform = 'meta'
         AND status = 'active'
       ORDER BY token_expires_at DESC NULLS LAST
       LIMIT 1
     ) sc ON true
     WHERE bap.platform = 'meta_ads'
       AND bap.ad_id IS NOT NULL
       AND bap.status = ANY($1)
       AND bap.created_at > NOW() - INTERVAL '30 days'
       ${opts.projectId ? 'AND bap.project_id = $3' : ''}
     ORDER BY bap.updated_at ASC NULLS FIRST
     LIMIT $2`,
    opts.projectId ? [NON_TERMINAL_STATUSES, limit, opts.projectId] : [NON_TERMINAL_STATUSES, limit]
  )) as PublishRow[]

  for (const row of rows) {
    result.checked++

    // No usable token (disconnected account or expired) → leave row for next run.
    if (!row.accessToken || (row.tokenExpiresAt && new Date(row.tokenExpiresAt) < new Date())) {
      result.skipped++
      continue
    }

    try {
      const { effectiveStatus } = await getAdStatus(row.adId, row.accessToken)
      const mapped = mapMetaEffectiveStatus(effectiveStatus)

      // Always stamp lastSyncedAt; only bump status (+ updated_at) when it changed.
      const meta = JSON.stringify({ effectiveStatus, lastSyncedAt: new Date().toISOString() })

      if (mapped !== row.status) {
        await execute(
          `UPDATE banner_ad_publishes
           SET status = $1,
               updated_at = NOW(),
               metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb
           WHERE id = $3`,
          [mapped, meta, row.id]
        )
        result.updated++
      } else {
        await execute(
          `UPDATE banner_ad_publishes
           SET metadata = COALESCE(metadata, '{}'::jsonb) || $1::jsonb
           WHERE id = $2`,
          [meta, row.id]
        )
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error(`[meta-ad-status-sync] ad ${row.adId} failed:`, message)
      result.errors++
    }
  }

  return result
}
