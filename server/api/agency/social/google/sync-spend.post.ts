import { requireAuth } from '~~/server/utils/auth'
import { syncGoogleSpend } from '~~/server/utils/spendSync'
import { runSpendSyncInBackground } from '~~/server/utils/asyncBackground'
import { createSpendSyncJob, completeSpendSyncJob, failSpendSyncJob } from '~~/server/utils/spendSyncJobs'

/**
 * POST /api/agency/social/google/sync-spend
 *
 * Kicks off Google Ads campaign spend sync in the background via waitUntil and
 * returns immediately. See meta/sync-spend.post.ts for the rationale.
 *
 * A spend_sync_jobs row is created so the UI can poll
 * /api/agency/social/spend/sync-status and refresh its content (and surface any
 * per-account failures) when the sync actually finishes.
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

  const jobId = await createSpendSyncJob('google', period, (user as any)?.id ?? null)

  return runSpendSyncInBackground(event, {
    label: `google sync-spend ${period}`,
    sync: () => syncGoogleSpend(month, year),
    kvKeys: [
      `spend:summary:${period}:all`,
      `spend:summary:${period}:google_ads`,
      `spend:google:accounts:${period}`,
      `spend:daily:google:${period}`,
    ],
    extra: { jobId },
    onComplete: (result) => completeSpendSyncJob(jobId, result),
    onError: (err: any) => failSpendSyncJob(jobId, err?.message || String(err)),
  })
})
