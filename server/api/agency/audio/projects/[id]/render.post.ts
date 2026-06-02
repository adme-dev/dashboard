import { z } from 'zod'
import { requireWriteAccess } from '~~/server/utils/auth'
import { getProjectWithCurrentTimeline, createRenderJob, markRenderJobFailed } from '~~/server/utils/audio/projects'
import { TimelineStateSchema, validateTimeline } from '~~/server/utils/audio/timelineSchema'
import { enqueueTimelineRender } from '~~/server/utils/audio/renderQueue'
import type { AudioChannel } from '~~/server/utils/audio/profiles'

const ALL_CHANNELS: AudioChannel[] = ['radio', 'tiktok', 'meta']
const BodySchema = z.object({
  channels: z.array(z.enum(['radio', 'tiktok', 'meta'])).nonempty().optional()
})

export default defineEventHandler(async (event) => {
  const user = await requireWriteAccess(event)
  const id = getRouterParam(event, 'id')!
  const bodyResult = BodySchema.safeParse(await readBody(event))
  if (!bodyResult.success) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid render request', data: { errors: bodyResult.error.issues.map((i) => i.message) } })
  }
  const channels = bodyResult.data.channels ?? ALL_CHANNELS

  const existing = await getProjectWithCurrentTimeline(id)
  if (!existing) throw createError({ statusCode: 404, statusMessage: 'Project not found' })
  if (!existing.project.currentTimelineId || !existing.timeline) {
    throw createError({ statusCode: 409, statusMessage: 'Project has no current timeline to render' })
  }

  // Validate the exact state we are about to freeze + render.
  const parsed = TimelineStateSchema.safeParse(existing.timeline.state)
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid timeline', data: { errors: parsed.error.issues.map((i) => i.message) } })
  }
  const check = validateTimeline(parsed.data)
  if (check.ok === false) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid timeline', data: { errors: check.errors } })
  }

  const job = await createRenderJob({ projectId: id, requestedBy: user.id, channels })
  try {
    await enqueueTimelineRender(event, {
      jobId: job.id, projectId: id, timelineId: job.timelineId, channels
    })
  } catch (e: any) {
    // The DB row is the durable record; if enqueue fails, mark the job failed so it
    // surfaces in the list instead of hanging in 'queued' with nothing to consume it.
    await markRenderJobFailed(job.id, `enqueue failed: ${e?.message ?? String(e)}`)
    throw createError({ statusCode: 502, statusMessage: 'Failed to enqueue render' })
  }

  setResponseStatus(event, 202)
  return { job }
})
