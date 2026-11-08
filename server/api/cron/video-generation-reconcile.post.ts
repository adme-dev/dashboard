import { queryRows } from '~~/server/utils/db'
import { mapVideoGenerationJobRow, markVideoGenerationJobFailed, failUnclaimedVideoGenerationDispatch } from '~~/server/utils/video-generation/jobs'
import { makeAiGatewayProvider } from '~~/server/utils/video-generation/providers/aiGatewayProvider'
import { reconcileRunningJob } from '~~/server/utils/video-generation/reconcile'
import { finalizeVideoGenerationJob } from '~~/server/utils/video-generation/finalize'
import {
  INFLIGHT_VIDEO_GENERATION_POLL_SQL,
  RETAINED_VIDEO_GENERATION_RUNNING_SQL,
  UNCLAIMED_VIDEO_GENERATION_DISPATCH_SQL,
} from '~~/shared/video/generationLiability'

export default defineEventHandler(async (event) => {
  const env = event.context?.cloudflare?.env ?? process.env
  if (typeof env.CRON_SECRET !== 'string' || !env.CRON_SECRET || getHeader(event, 'x-cron-secret') !== env.CRON_SECRET) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  if (env.VIDEO_GENERATION_ENABLED !== 'true') {
    return { ran: false, reason: 'disabled' }
  }

  // Only a queued row that never claimed a submit, has no provider id, and is
  // dispatch-eligible can release. Claimed, unknown, and storyboard-held rows stay.
  const undispatched = await queryRows(UNCLAIMED_VIDEO_GENERATION_DISPATCH_SQL)
  let dispatchTimedOut = 0
  for (const row of undispatched) {
    const updated = await failUnclaimedVideoGenerationDispatch(
      row.id,
      'Dispatch timeout: no queue consumer claimed this dispatch-eligible job within 10 minutes.',
    ).catch(() => null)
    if (updated?.status === 'failed') dispatchTimedOut++
  }

  // Running and unknown work keeps its liability after the old 20-minute window.
  const retained = await queryRows(RETAINED_VIDEO_GENERATION_RUNNING_SQL)
  const retainedRunning = retained.length

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
    const inflight = await queryRows(INFLIGHT_VIDEO_GENERATION_POLL_SQL)
    for (const row of inflight) {
      polled++
      const outcome = await reconcileRunningJob(mapVideoGenerationJobRow(row), deps).catch(() => 'skipped' as const)
      if (outcome === 'succeeded') succeeded++
      else if (outcome === 'failed') failed++
      else if (outcome === 'running') running++
    }
  }

  return {
    ran: true,
    dispatchTimedOut,
    retainedRunning,
    reaped: 0,
    polled,
    succeeded,
    failed,
    running,
    aiBinding: !!aiBinding,
  }
})
