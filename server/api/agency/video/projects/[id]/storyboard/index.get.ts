import { defineEventHandler } from 'h3'
import { requireAuth } from '~~/server/utils/auth'
import { getStoryboard, resolveReferenceSet } from '~~/server/utils/video-storyboard/store'
import { storyboardRouteId, storyboardRequestDependencies } from '~~/server/utils/video-storyboard/request'

// Saved work stays readable with creation disabled. Reads never create records.
export default defineEventHandler(async (event) => {
  const actor = await requireAuth(event)
  const projectId = storyboardRouteId(event)
  const saved = await getStoryboard(projectId, actor)
  const resolved = await resolveReferenceSet({ projectId, actor, revisionId: saved.revision?.id }, storyboardRequestDependencies(event))
  return { ...saved, readiness: resolved?.findings ?? [] }
})
