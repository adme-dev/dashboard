import { defineEventHandler } from 'h3'
import { requireAuth } from '~~/server/utils/auth'
import { getStoryboard, resolveReferenceSet } from '~~/server/utils/video-storyboard/store'
import { storyboardRouteId, storyboardRequestDependencies } from '~~/server/utils/video-storyboard/request'

export default defineEventHandler(async (event) => {
  const actor = await requireAuth(event)
  const projectId = storyboardRouteId(event)
  const revisionId = storyboardRouteId(event, 'revision')
  const saved = await getStoryboard(projectId, actor, revisionId)
  const resolved = await resolveReferenceSet({ projectId, actor, revisionId }, storyboardRequestDependencies(event))
  return { ...saved, readiness: resolved?.findings ?? [] }
})
