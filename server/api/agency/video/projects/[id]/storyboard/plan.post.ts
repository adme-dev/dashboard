import { createError, defineEventHandler, readBody } from 'h3'
import { requireWriteAccess } from '~~/server/utils/auth'
import { requireStoryboardEnabled } from '~~/server/utils/video-storyboard/policy'
import { storyboardRouteId, storyboardRequestDependencies } from '~~/server/utils/video-storyboard/request'
import { StoryboardPlanningRequestSchema } from '~~/server/utils/video-storyboard/planningRequest'
import { createStoryboardPlan } from '~~/server/utils/video-storyboard/candidates'
import { executeStoryboardPlan } from '~~/server/utils/video-storyboard/planningGodMode'

export default defineEventHandler(async (event) => {
  const actor = await requireWriteAccess(event)
  requireStoryboardEnabled(event)
  const projectId = storyboardRouteId(event)
  const request = StoryboardPlanningRequestSchema.safeParse(await readBody(event))
  if (!request.success) throw createError({ statusCode: 400, statusMessage: 'Invalid storyboard planning request' })
  return executeStoryboardPlan(event, onDispatch => createStoryboardPlan({ projectId, actor, request: request.data }, { ...storyboardRequestDependencies(event), onDispatch }))
})
