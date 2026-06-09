import { queryRows } from '~~/server/utils/db'
import { mapVideoGenerationJobRow, markVideoGenerationJobFailed } from '~~/server/utils/video-generation/jobs'

export default defineEventHandler(async (event) => {
  if (getHeader(event, 'x-cron-secret') !== process.env.CRON_SECRET) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  if (process.env.VIDEO_STUDIO_ENABLED !== 'true' || process.env.VIDEO_GENERATION_ENABLED !== 'true') {
    return { ran: false, reason: 'disabled' }
  }
  // The active transport (Cloudflare AI Gateway) is SYNCHRONOUS: a job is finalized in the
  // same worker invocation, so a job still 'running' past the window means the worker died
  // mid-flight — its in-memory result is gone and cannot be polled back. Reap such jobs as
  // failed so they don't sit forever (the queue's own retries cover transient errors).
  // When an ASYNC provider (fal.ai) lands, poll it here for its jobs instead of reaping.
  const rows = await queryRows(
    `SELECT * FROM video_generation_jobs
     WHERE status = 'running' AND started_at < now() - interval '15 minutes'
     ORDER BY started_at ASC LIMIT 25`
  )
  let reaped = 0
  for (const row of rows) {
    const job = mapVideoGenerationJobRow(row)
    await markVideoGenerationJobFailed(job.id, 'timed out — no completion within the reconcile window').catch(() => {})
    reaped++
  }
  return { ran: true, reaped, checked: rows.length }
})
