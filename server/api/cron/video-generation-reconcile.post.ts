import { queryRows } from '~~/server/utils/db'
import { mapVideoGenerationJobRow, markVideoGenerationJobFailed } from '~~/server/utils/video-generation/jobs'
import { makeAiGatewayProvider } from '~~/server/utils/video-generation/providers/aiGatewayProvider'
import { reconcileRunningJob } from '~~/server/utils/video-generation/reconcile'
import { finalizeVideoGenerationJob } from '~~/server/utils/video-generation/finalize'

// Cloudflare's async video models finish within ~5 min. A job still 'running' past this
// window is dead (worker died, or the provider never completed) → reap it as failed. Inside
// the window, poll the provider by request_id and finalize when it completes.
const RECONCILE_WINDOW = `20 minutes`

export default defineEventHandler(async (event) => {
  if (getHeader(event, 'x-cron-secret') !== process.env.CRON_SECRET) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  if (process.env.VIDEO_STUDIO_ENABLED !== 'true' || process.env.VIDEO_GENERATION_ENABLED !== 'true') {
    return { ran: false, reason: 'disabled' }
  }

  // Backstop: reap jobs that blew past the completion window.
  const stale = await queryRows(
    `SELECT * FROM video_generation_jobs
       WHERE status = 'running' AND started_at < now() - interval '${RECONCILE_WINDOW}'
       ORDER BY started_at ASC LIMIT 25`
  )
  let reaped = 0
  for (const row of stale) {
    const job = mapVideoGenerationJobRow(row)
    await markVideoGenerationJobFailed(job.id, 'timed out — no completion within the reconcile window').catch(() => {})
    reaped++
  }

  // Poll in-flight async (aigateway) jobs for completion. The Workers AI binding on Pages is
  // exposed per-request via event.context.cloudflare.env — NOT process.env.
  const aiBinding = (event.context as any)?.cloudflare?.env?.AI
  let polled = 0
  let succeeded = 0
  let failed = 0
  let running = 0
  if (aiBinding) {
    const deps = {
      providers: {
        aigateway: makeAiGatewayProvider({
          run: (model: string, inputs: Record<string, unknown>, options?: Record<string, unknown>) =>
            aiBinding.run(model, inputs, options),
        }),
      },
      finalize: finalizeVideoGenerationJob,
      markFailed: markVideoGenerationJobFailed,
    }
    const inflight = await queryRows(
      `SELECT * FROM video_generation_jobs
         WHERE status = 'running' AND provider = 'aigateway'
           AND started_at >= now() - interval '${RECONCILE_WINDOW}'
         ORDER BY started_at ASC LIMIT 25`
    )
    for (const row of inflight) {
      polled++
      const outcome = await reconcileRunningJob(mapVideoGenerationJobRow(row), deps).catch(() => 'skipped' as const)
      if (outcome === 'succeeded') succeeded++
      else if (outcome === 'failed') failed++
      else if (outcome === 'running') running++
    }
  }

  return { ran: true, reaped, polled, succeeded, failed, running, aiBinding: !!aiBinding }
})
