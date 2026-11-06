import { createError, defineEventHandler, readBody } from 'h3'
import { requireWriteAccess } from '~~/server/utils/auth'
import { storyboardRouteId, storyboardRequestDependencies } from '~~/server/utils/video-storyboard/request'
import { TimelineReviewRequestSchema, reviewAdjustedTimelineIn } from '~~/server/utils/video-storyboard/timelineReview'
import { executeStoryboardReferenceWrite } from '~~/server/utils/video-storyboard/godMode'
// Recovery of an applied edit deliberately remains available with the entry flag off.
export default defineEventHandler(async (event) => {
  const actor = await requireWriteAccess(event)
  const request = TimelineReviewRequestSchema.safeParse(await readBody(event))
  if (!request.success) throw createError({ statusCode: 400, statusMessage: 'Invalid timeline review request' })
  return executeStoryboardReferenceWrite(event, async (db) => {
    const result = await reviewAdjustedTimelineIn(db, { ...request.data, actor, projectId: storyboardRouteId(event) }, storyboardRequestDependencies(event))
    return { ...result, id: result.review.id }
  })
})
