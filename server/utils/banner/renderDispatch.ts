export const BANNER_RETRY_WAIT_MS = 15 * 60 * 1000

export function canRetryBannerJob(job: { status: string, updated_at?: Date | string }, now = Date.now()): boolean {
  if (job.status === 'failed') return true
  if (job.status !== 'queued' || !job.updated_at) return false
  const updated = new Date(job.updated_at).getTime()
  return Number.isFinite(updated) && now - updated >= BANNER_RETRY_WAIT_MS
}

/** A queue binding rejection does not prove that the message was never accepted. */
export async function dispatchBannerRenderJob(jobId: string, deps: {
  beforeDispatch: () => Promise<void>
  send: (message: { jobId: string }) => Promise<void>
  recordFailure: (jobId: string, uncertain: boolean, message: string) => Promise<void>
}): Promise<void> {
  try {
    await deps.beforeDispatch()
  } catch (error) {
    await deps.recordFailure(jobId, false, 'Render was not submitted: dispatch authorization failed. Retry this job after resolving the error.')
    throw error
  }
  try {
    await deps.send({ jobId })
  } catch (error) {
    await deps.recordFailure(jobId, true, 'Queue submission could not be confirmed. This job may still render. Refresh its status; if it remains queued for 15 minutes, retry this same job.')
    throw error
  }
}

export const RECORD_BANNER_DISPATCH_FAILURE_SQL = `UPDATE banner_render_jobs
  SET status = CASE WHEN $2 THEN 'queued' ELSE 'failed' END, error = $3,
      updated_at = now(), finished_at = CASE WHEN $2 THEN NULL ELSE now() END
  WHERE id = $1 AND status = 'queued'`

// One contender reserves a retry; late/duplicate requests cannot send again.
export const RESERVE_BANNER_RETRY_SQL = `UPDATE banner_render_jobs
  SET status = 'queued', error = NULL, finished_at = NULL, updated_at = now()
  WHERE id = $1 AND (status = 'failed' OR (status = 'queued' AND updated_at <= now() - interval '15 minutes'))
  RETURNING id`
