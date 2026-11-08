import { requireAuth } from '~~/server/utils/auth'
import { assertMediaProjectAccess, getProjectFresh, listRenderJobs } from '~~/server/utils/audio/projects'

export default defineEventHandler(async (event) => {
  const actor = await requireAuth(event)
  const id = getRouterParam(event, 'id')!
  const project = await getProjectFresh(id)
  if (!project) throw createError({ statusCode: 404, statusMessage: 'Project not found' })
  assertMediaProjectAccess(actor, project)
  const jobs = await listRenderJobs(id)
  return { jobs }
})
