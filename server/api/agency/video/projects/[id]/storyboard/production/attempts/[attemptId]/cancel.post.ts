import { defineEventHandler } from 'h3'
import { requireWriteAccess } from '~~/server/utils/auth'
import { executeStoryboardReferenceWrite } from '~~/server/utils/video-storyboard/godMode'
import { storyboardRouteId } from '~~/server/utils/video-storyboard/request'
import { cancelShotAttemptIn } from '~~/server/utils/video-storyboard/production'

// Cancellation and saved evidence remain accessible when new production is disabled.
export default defineEventHandler(async (event) => {
  const actor = await requireWriteAccess(event)
  const projectId = storyboardRouteId(event)
  const attemptId = storyboardRouteId(event, 'attemptId')
  const attempt = await executeStoryboardReferenceWrite(event, db => cancelShotAttemptIn(db, { projectId, attemptId, actor }))
  return { attempt }
})
