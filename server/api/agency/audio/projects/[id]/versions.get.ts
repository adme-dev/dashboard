import { requireAuth } from '~~/server/utils/auth'
import { assertMediaProjectAccess, getProjectFresh, listVersions } from '~~/server/utils/audio/projects'

export default defineEventHandler(async (event) => {
  const actor = await requireAuth(event)
  const id = getRouterParam(event, 'id')!
  const project = await getProjectFresh(id)
  if (!project) throw createError({ statusCode: 404, statusMessage: 'Project not found' })
  assertMediaProjectAccess(actor, project)
  const versions = await listVersions(id)
  return { versions }
})
