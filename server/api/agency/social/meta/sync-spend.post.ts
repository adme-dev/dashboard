import { requireAuth } from '~~/server/utils/auth'
import { syncMetaSpend } from '~~/server/utils/spendSync'
import { runSpendSyncInBackground } from '~~/server/utils/asyncBackground'
import { createSpendSyncJob, completeSpendSyncJob, failSpendSyncJob } from '~~/server/utils/spendSyncJobs'
import { getQueue } from '~~/server/utils/queue'

/**
 * POST /api/agency/social/meta/sync-spend
 *
 * Meta has 100+ connected ad accounts; the sequential sync over all of them
 * can take 10+ minutes and was getting evicted mid-run on the request's
 * waitUntil background (leaving accounts unsynced). So we dispatch the work to
 * the Cloudflare Queue consumer, which has a much longer runtime budget and
 * always runs the full sync to completion. Locally (no JOBS_QUEUE binding) — or
 * if enqueue fails — we fall back to the inline waitUntil path.
 *
 * A spend_sync_jobs row is created so the UI can poll
 * /api/agency/social/spend/sync-status and refresh its content (and surface any
 * per-account failures) when the sync finishes. The consumer updates that row.
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

  // Preferred path: hand off to the Queue consumer (long runtime budget).
  const queue = getQueue(event)
  if (queue) {
    try {
      await queue.send(
        { type: 'spend.sync.meta', payload: { month, year, jobId }, enqueuedAt: new Date().toISOString() },
        { contentType: 'json' }
      )
      return { status: 'started', startedAt: new Date().toISOString(), jobId, queued: true }
    } catch (err) {
      console.error('[meta sync-spend] enqueue failed, falling back to inline waitUntil:', err)
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
