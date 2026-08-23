import { z } from 'zod'
import { requireWriteAccess } from '~~/server/utils/auth'
import { getProjectWithCurrentTimeline } from '~~/server/utils/audio/projects'
import { createSourceAsset } from '~~/server/utils/video-generation/sourceAssetStore'
import { imageContentTypeForR2Key } from '~~/server/utils/video-generation/sourceContentTypes'
import { canUseTimelineStillProject, findTimelineStillSource } from '~~/server/utils/video-generation/timelineStillSource'
import { withGodModeLedger } from '~~/server/utils/video/godModeStudioMutations'

const BodySchema = z.object({
  projectId: z.string().uuid(),
  clipId: z.string().min(1),
  subjectType: z.enum(['vehicle', 'non_vehicle', 'unknown']).default('unknown'),
})

// Owners (God mode) run this under the execution ledger; staff run it directly.
export default defineEventHandler(event => withGodModeLedger(event, 'sourceAssetFromStill', async () => {
  if (process.env.VIDEO_GENERATION_ENABLED !== 'true') {
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  }

  const user = await requireWriteAccess(event)
  const parsed = BodySchema.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Invalid request' })

  const project = await getProjectWithCurrentTimeline(parsed.data.projectId)
  if (!project?.timeline?.state || project.project.mediaType !== 'av') {
    throw createError({ statusCode: 404, statusMessage: 'Timeline still not found' })
  }
  if (!canUseTimelineStillProject(user, project.project)) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  }

  const still = findTimelineStillSource(project.timeline.state, parsed.data.clipId)
  if (!still) throw createError({ statusCode: 404, statusMessage: 'Timeline still not found' })

  const contentType = imageContentTypeForR2Key(still.r2Key)
  if (!contentType) throw createError({ statusCode: 400, statusMessage: 'Timeline source must be an image' })

  const source = await createSourceAsset({
    clientId: project.project.clientId ?? null,
    createdBy: user.id,
    r2Key: still.r2Key,
    contentType,
    subjectType: parsed.data.subjectType,
  })

  setResponseStatus(event, 201)
  return { id: source.id, status: source.status }
}))
