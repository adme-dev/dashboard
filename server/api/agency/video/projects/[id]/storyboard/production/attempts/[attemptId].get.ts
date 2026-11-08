import { defineEventHandler } from 'h3'
import { requireAuth } from '~~/server/utils/auth'
import { storyboardRouteId } from '~~/server/utils/video-storyboard/request'
import { getShotProductionAttempt } from '~~/server/utils/video-storyboard/production'

export default defineEventHandler(async (event) => {
  const actor = await requireAuth(event)
  const attempt = await getShotProductionAttempt({ projectId: storyboardRouteId(event), attemptId: storyboardRouteId(event, 'attemptId'), actor })
  return { attempt }
})
