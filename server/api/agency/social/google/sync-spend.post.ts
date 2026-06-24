import { requireAuth } from '~~/server/utils/auth'
import { listGoogleConnectionIds, syncGoogleSpend } from '~~/server/utils/spendSync'
import { runSpendSyncInBackground } from '~~/server/utils/asyncBackground'
import { createSpendSyncJob, completeSpendSyncJob, failSpendSyncJob, setSyncJobTotalAccounts } from '~~/server/utils/spendSyncJobs'
import { getQueue } from '~~/server/utils/queue'

/**
 * POST /api/agency/social/google/sync-spend
 *
 * Kicks off Google Ads campaign spend sync. In production this fans out one
 * queue message per connected ad account so large MCCs don't sit inside one
 * long waitUntil task. Locally, or if enqueueing fails, it falls back to the
 * old waitUntil bulk sync path.
 *
 * A spend_sync_jobs row is created so the UI can poll
 * /api/agency/social/spend/sync-status and refresh its content (and surface any
 * per-account failures) when the sync actually finishes.
 *
 * Body: { month?: number, year?: number }
 */
export default eventHandler(async (event) => {
  const user = await requireAuth(event)
  const startedBy = typeof user === 'object' && user !== null && 'id' in user
    ? String(user.id)
    : null

  const body = await readBody(event).catch(() => null)
  const now = new Date()
  const month = body?.month || now.getMonth() + 1
  const year = body?.year || now.getFullYear()
  const period = `${year}-${String(month).padStart(2, '0')}`

  const jobId = await createSpendSyncJob('google', period, startedBy)

  const queue = getQueue(event)
  if (queue) {
    try {
      const connectionIds = await listGoogleConnectionIds()
      if (connectionIds.length === 0) {
        await completeSpendSyncJob(jobId, { synced: 0, totalSpend: 0, failures: [] })
        return { status: 'started', startedAt: new Date().toISOString(), jobId, queued: true, accounts: 0 }
      }

      await setSyncJobTotalAccounts(jobId, connectionIds.length)
      const enqueuedAt = new Date().toISOString()
      await Promise.all(
        connectionIds.map(connectionId =>
          queue.send(
            { type: 'spend.sync.google.account', payload: { connectionId, month, year, jobId }, enqueuedAt },
            { contentType: 'json' }
          )
        )
      )
      return { status: 'started', startedAt: new Date().toISOString(), jobId, queued: true, accounts: connectionIds.length }
    } catch (err) {
      console.error('[google sync-spend] fan-out enqueue failed, falling back to inline waitUntil:', err)
    }
  }

  return runSpendSyncInBackground(event, {
    label: `google sync-spend ${period}`,
    sync: () => syncGoogleSpend(month, year),
    kvKeys: [
      `spend:summary:${period}:all`,
      `spend:summary:${period}:google_ads`,
      `spend:google:accounts:${period}`,
      `spend:daily:google:${period}`
    ],
    extra: { jobId },
    onComplete: result => completeSpendSyncJob(jobId, result),
    onError: err => failSpendSyncJob(jobId, err instanceof Error ? err.message : String(err))
  })
})
