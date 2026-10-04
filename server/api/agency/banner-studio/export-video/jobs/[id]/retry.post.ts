import { createError, getRouterParam } from 'h3'
import { requireWriteAccess } from '~~/server/utils/auth'
import { execute, queryOneFresh } from '~~/server/utils/db'
import { hasAllSocialClientAccess, isSocialClientId, requireSocialClientAccess } from '~~/server/utils/social/clientAccess'
import { canRetryBannerJob, dispatchBannerRenderJob, RECORD_BANNER_DISPATCH_FAILURE_SQL, RESERVE_BANNER_RETRY_SQL } from '~~/server/utils/banner/renderDispatch'

export default defineEventHandler(async (event) => {
  const user = await requireWriteAccess(event)
  const jobId = getRouterParam(event, 'id')
  if (!isSocialClientId(jobId)) throw createError({ statusCode: 400, statusMessage: 'A valid render job is required' })
  const job = await queryOneFresh<{ status: string, updated_at: string, source_r2_key: string, client_id: string | null, created_by: string }>(
    `SELECT j.status, j.updated_at, j.source_r2_key, p.client_id, p.created_by
       FROM banner_render_jobs j JOIN banner_projects p ON p.id = j.project_id WHERE j.id = $1`, [jobId])
  if (!job) throw createError({ statusCode: 404, statusMessage: 'Render job not found' })
  if (job.client_id) await requireSocialClientAccess(event, job.client_id)
  else if (job.created_by !== user.id && !hasAllSocialClientAccess(user)) throw createError({ statusCode: 403, statusMessage: 'No access to this project' })
  if (!canRetryBannerJob(job)) throw createError({ statusCode: 409, statusMessage: 'This job is active or complete. Refresh its status before retrying.' })
  const env = event.context.cloudflare?.env as {
    BANNER_RENDER_QUEUE?: { send: (message: { jobId: string }) => Promise<void> }
    MEDIA_BUCKET?: { head: (key: string) => Promise<unknown> }
  } | undefined
  if (!env?.BANNER_RENDER_QUEUE || !env.MEDIA_BUCKET) throw createError({ statusCode: 503, statusMessage: 'The render queue or source storage is unavailable' })
  if (!await env.MEDIA_BUCKET.head(job.source_r2_key)) {
    // A missing source is definitive. Release a queued or expired row, without
    // overwriting a worker that acquired it while source storage was checked.
    await execute(`UPDATE banner_render_jobs SET status='failed', error=$2, finished_at=now(), updated_at=now()
      WHERE id=$1 AND status IN ('queued', 'rendering') AND updated_at <= now() - interval '15 minutes'`,
    [jobId, 'The render source is no longer available. Export the current design instead.'])
    throw createError({ statusCode: 410, statusMessage: 'The source for this render is no longer available. Export the current design instead.' })
  }
  const reserved = await queryOneFresh<{ id: string }>(RESERVE_BANNER_RETRY_SQL, [jobId])
  if (!reserved) throw createError({ statusCode: 409, statusMessage: 'The job status changed. Refresh to see its latest status.' })
  await dispatchBannerRenderJob(jobId!, {
    beforeDispatch: async () => {},
    send: message => env.BANNER_RENDER_QUEUE!.send(message),
    recordFailure: async (id, uncertain, message) => {
      await execute(RECORD_BANNER_DISPATCH_FAILURE_SQL, [id, uncertain, message])
    }
  })
  return { jobId, status: 'queued' }
})
