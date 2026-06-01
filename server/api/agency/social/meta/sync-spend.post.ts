import { requireAuth } from '~~/server/utils/auth'
import { syncMetaSpend, listMetaConnectionIds } from '~~/server/utils/spendSync'
import { runSpendSyncInBackground } from '~~/server/utils/asyncBackground'
import { createSpendSyncJob, completeSpendSyncJob, failSpendSyncJob, setSyncJobTotalAccounts } from '~~/server/utils/spendSyncJobs'
import { getQueue } from '~~/server/utils/queue'

/**
 * POST /api/agency/social/meta/sync-spend
 *
 * Meta has 100+ connected ad accounts. A single sync over all of them can't
 * finish inside one Cloudflare Queue consumer invocation (no request context →
 * db.ts falls back to the ~9x-slower neon() HTTP driver), so we FAN OUT: one
 * queue message per connection. Each message syncs a single account fast and
 * atomically fans its result into the job row (see recordSyncJobAccountResult);
 * the job completes when the last account lands. This always runs to completion.
 *
 * Locally (no JOBS_QUEUE binding) — or if enqueue fails — we fall back to the
 * inline waitUntil path, which runs the whole sync in one go.
 *
 * A spend_sync_jobs row is created so the UI can poll
 * /api/agency/social/spend/sync-status and refresh when the sync finishes.
 *
 * Body: { month?: number, year?: number }
 */
export default eventHandler(async (event) => {
  const user = await requireAuth(event)

  const body = await readBody(event).catch(() => null)
  const now = new Date()
  const month = body?.month || now.getMonth() + 1
  const year = body?.year || now.getFullYear()
  const period = `${year}-${String(month).padStart(2, '0')}`

  const jobId = await createSpendSyncJob('meta', period, (user as any)?.id ?? null)

  // Preferred path: fan out one queue message per ad account.
  const queue = getQueue(event)
  if (queue) {
    try {
      const connectionIds = await listMetaConnectionIds()
      if (connectionIds.length === 0) {
        await completeSpendSyncJob(jobId, { synced: 0, totalSpend: 0, failures: [] })
        return { status: 'started', startedAt: new Date().toISOString(), jobId, queued: true, accounts: 0 }
      }
      await setSyncJobTotalAccounts(jobId, connectionIds.length)
      const enqueuedAt = new Date().toISOString()
      await Promise.all(
        connectionIds.map(connectionId =>
          queue.send(
            { type: 'spend.sync.meta.account', payload: { connectionId, month, year, jobId }, enqueuedAt },
            { contentType: 'json' }
          )
        )
      )
      return { status: 'started', startedAt: new Date().toISOString(), jobId, queued: true, accounts: connectionIds.length }
    } catch (err) {
      console.error('[meta sync-spend] fan-out enqueue failed, falling back to inline waitUntil:', err)
    }
  }

  // Fallback: no queue binding (local dev) or enqueue failed → run inline.
  return runSpendSyncInBackground(event, {
    label: `meta sync-spend ${period}`,
    sync: () => syncMetaSpend(month, year),
    kvKeys: [
      `spend:summary:${period}:all`,
      `spend:summary:${period}:meta`,
      `spend:meta:accounts:${period}`,
      `spend:daily:meta:${period}`,
    ],
    extra: { jobId, queued: false },
    onComplete: (result) => completeSpendSyncJob(jobId, result),
    onError: (err: any) => failSpendSyncJob(jobId, err?.message || String(err)),
  })
})
