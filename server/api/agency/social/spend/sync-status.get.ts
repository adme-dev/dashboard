import { requireAuth } from '~~/server/utils/auth'
import { queryOne } from '~~/server/utils/db'

/**
 * GET /api/agency/social/spend/sync-status?jobId=<uuid>
 *
 * Returns the status of a background spend sync (see spend_sync_jobs / migration
 * 125). The UI polls this after kicking off a sync so it can refresh its content
 * and surface per-account failures once the run finishes.
 */
export default eventHandler(async (event) => {
  await requireAuth(event)

  const jobId = getQuery(event).jobId as string | undefined
  if (!jobId) {
    throw createError({ statusCode: 400, statusMessage: 'jobId is required' })
  }

  const row = await queryOne<{
    id: string
    platform: string
    period: string
    status: string
    synced_count: number
    total_spend: string
    failures: Array<{ account: string; reason: string }>
    error: string | null
    started_at: string
    finished_at: string | null
  }>(
    `SELECT id, platform, period, status, synced_count, total_spend, failures, error, started_at, finished_at
     FROM spend_sync_jobs
     WHERE id = $1`,
    [jobId]
  )

  if (!row) {
    throw createError({ statusCode: 404, statusMessage: 'Sync job not found' })
  }

  return {
    jobId: row.id,
    platform: row.platform,
    period: row.period,
    status: row.status, // running | completed | failed
    syncedCount: row.synced_count,
    totalSpend: Number(row.total_spend) || 0,
    failures: row.failures || [],
    error: row.error,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
  }
})
