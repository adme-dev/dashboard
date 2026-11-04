import { defineEventHandler } from 'h3'
import { requireAuth } from '~~/server/utils/auth'
import { storyboardRouteId, storyboardRequestDependencies } from '~~/server/utils/video-storyboard/request'
import { getTimelineReview } from '~~/server/utils/video-storyboard/timelineReview'

export default defineEventHandler(async event => getTimelineReview({ actor: await requireAuth(event), projectId: storyboardRouteId(event) }, storyboardRequestDependencies(event)))
