import { requireWriteAccess } from '~~/server/utils/auth'
import { requireVideoProjectWriteAccess } from '~~/server/utils/video-asset-intelligence/access'
import { listProjectIntelligenceJobs } from '~~/server/utils/video-asset-intelligence/db'

export default defineEventHandler(async (event) => {
  const user = await requireWriteAccess(event)
  const projectId = getRouterParam(event, 'id')
  if (!projectId) throw createError({ statusCode: 400, statusMessage: 'Project id is required' })
  await requireVideoProjectWriteAccess(user, projectId, 'Asset intelligence requires an AV project')

  const rawLimit = Number(getQuery(event).limit ?? 50)
  const limit = Number.isFinite(rawLimit) ? rawLimit : 50
  const jobs = await listProjectIntelligenceJobs(projectId, limit)
  return { jobs }
})
