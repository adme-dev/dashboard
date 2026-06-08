// server/api/agency/audio/projects/[id]/render-video.post.ts
// Flag-gated composite-video render endpoint. Available only on AV projects and
// only when VIDEO_STUDIO_ENABLED='true'. Mirrors render.post.ts: snapshot →
// render-job → enqueue → 202.
import { z } from 'zod'
import { requireWriteAccess } from '~~/server/utils/auth'
import { getProjectWithCurrentTimeline, createRenderJob, markRenderJobFailed } from '~~/server/utils/audio/projects'
import { enqueueVideoRender } from '~~/server/utils/audio/renderQueue'

const ALL_FORMATS = ['reels_9x16', 'square_1x1', 'youtube_16x9'] as const
type VideoFormatKey = typeof ALL_FORMATS[number]

const BodySchema = z.object({
  formats: z.array(z.enum(ALL_FORMATS)).nonempty().optional()
})

export default defineEventHandler(async (event) => {
  if (process.env.VIDEO_STUDIO_ENABLED !== 'true') {
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  }

  const user = await requireWriteAccess(event)
  const id = getRouterParam(event, 'id')!

  const bodyResult = BodySchema.safeParse(await readBody(event))
  if (!bodyResult.success) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid render-video request',
      data: { errors: bodyResult.error.issues.map((i) => i.message) } })
  }
  const formats: VideoFormatKey[] = bodyResult.data.formats ?? [...ALL_FORMATS]

  const existing = await getProjectWithCurrentTimeline(id)
  if (!existing) throw createError({ statusCode: 404, statusMessage: 'Project not found' })
  if (existing.project.mediaType !== 'av') {
    throw createError({ statusCode: 400, statusMessage: 'render-video requires an AV project' })
  }
  if (!existing.project.currentTimelineId || !existing.timeline) {
    throw createError({ statusCode: 409, statusMessage: 'Project has no current timeline to render' })
  }

  // Snapshot + create the job row (same createRenderJob as audio — channels unused for
  // video but the row records who triggered it and acts as the durable anchor).
  const job = await createRenderJob({ projectId: id, requestedBy: user.id, channels: [] })
  try {
    await enqueueVideoRender(event, {
      jobId: job.id, projectId: id, timelineId: job.timelineId, formats
    })
  } catch (e: any) {
    await markRenderJobFailed(job.id, `enqueue failed: ${e?.message ?? String(e)}`)
    throw createError({ statusCode: 502, statusMessage: 'Failed to enqueue video render' })
  }

  setResponseStatus(event, 202)
  return { job }
})
