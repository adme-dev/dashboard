import { createError, defineEventHandler, readBody } from 'h3'
import { requireWriteAccess } from '~~/server/utils/auth'
import { requireStoryboardEnabled } from '~~/server/utils/video-storyboard/policy'
import { storyboardRouteId, storyboardRequestDependencies } from '~~/server/utils/video-storyboard/request'
import { StoryboardAcceptRequestSchema } from '~~/server/utils/video-storyboard/planningRequest'
import { acceptStoryboardCandidateIn } from '~~/server/utils/video-storyboard/candidates'
import { executeStoryboardReferenceWrite } from '~~/server/utils/video-storyboard/godMode'

export default defineEventHandler(async (event) => {
  const actor = await requireWriteAccess(event)
  requireStoryboardEnabled(event)
  const projectId = storyboardRouteId(event)
  const request = StoryboardAcceptRequestSchema.safeParse(await readBody(event))
  if (!request.success) throw createError({ statusCode: 400, statusMessage: 'Review and explicitly accept the candidate changes first.' })
  const revision = await executeStoryboardReferenceWrite(event, db => acceptStoryboardCandidateIn(db, { ...request.data, projectId, actor }, storyboardRequestDependencies(event)))
  return { revision }
})
