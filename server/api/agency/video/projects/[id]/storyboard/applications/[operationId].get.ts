import { defineEventHandler } from 'h3'
import { requireAuth } from '~~/server/utils/auth'
import { storyboardRouteId } from '~~/server/utils/video-storyboard/request'
import { getStoryboardApplication } from '~~/server/utils/video-storyboard/apply'

// Recovery is authorized and remains available when new applications are disabled.
export default defineEventHandler(async (event) => {
  const actor = await requireAuth(event)
  return getStoryboardApplication({ actor, projectId: storyboardRouteId(event), operationId: storyboardRouteId(event, 'operationId') })
})
