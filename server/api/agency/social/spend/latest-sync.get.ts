import { z } from 'zod'
import { requireAuth } from '~~/server/utils/auth'
import { queryOne } from '~~/server/utils/db'
import {
  sanitizeSpendSyncFailureReason,
  sanitizeSpendSyncFailures,
} from '~~/server/utils/spendSyncFailureSanitizer'

const QuerySchema = z.object({
  platform: z.enum(['meta', 'google', 'linkedin', 'tiktok', 'pinterest', 'snapchat', 'twitter', 'microsoft_ads']),
  period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
})

interface SpendSyncJobRow {
  id: string
  platform: 'meta' | 'google' | 'linkedin' | 'tiktok' | 'pinterest' | 'snapchat' | 'twitter' | 'microsoft_ads'
  period: string
  status: 'running' | 'completed' | 'failed'
  synced_count: number
  total_spend: string
  failures: unknown
  error: string | null
  started_at: string
  finished_at: string | null
  total_accounts: number | null
  processed_accounts: number
}

export default eventHandler(async (event) => {
  await requireAuth(event)

  const parsed = QuerySchema.safeParse(getQuery(event))
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid platform or period' })
  }

  const row = await queryOne<SpendSyncJobRow>(
    `SELECT id, platform, period, status, synced_count, total_spend, failures, error,
            started_at, finished_at, total_accounts, processed_accounts
       FROM spend_sync_jobs
      WHERE platform = $1 AND period = $2
      ORDER BY started_at DESC
      LIMIT 1`,
    [parsed.data.platform, parsed.data.period],
  )

  if (!row) return null

  return {
    jobId: row.id,
    platform: row.platform,
    period: row.period,
    status: row.status,
    syncedCount: Number(row.synced_count) || 0,
    totalSpend: Number(row.total_spend) || 0,
    failures: sanitizeSpendSyncFailures(row.failures),
    error: row.error ? sanitizeSpendSyncFailureReason(row.error) : null,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    totalAccounts: row.total_accounts == null ? null : Number(row.total_accounts),
    processedAccounts: Number(row.processed_accounts) || 0,
  }
})
