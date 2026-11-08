import { requireAuth } from '~~/server/utils/auth'
import { assertMediaProjectAccess, getProjectWithCurrentTimeline } from '~~/server/utils/audio/projects'

export default defineEventHandler(async (event) => {
  const actor = await requireAuth(event)
  const id = getRouterParam(event, 'id')!
  const res = await getProjectWithCurrentTimeline(id)
  if (!res) throw createError({ statusCode: 404, statusMessage: 'Project not found' })
  assertMediaProjectAccess(actor, res.project)
  return { project: res.project, timeline: res.timeline }
})
