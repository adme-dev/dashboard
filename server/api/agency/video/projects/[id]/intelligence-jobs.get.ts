import { getProjectWithCurrentTimeline } from '~~/server/utils/audio/projects'
import { listProjectIntelligenceJobs } from '~~/server/utils/video-asset-intelligence/db'

export default defineEventHandler(async (event) => {
  const projectId = getRouterParam(event, 'id')
  if (!projectId) throw createError({ statusCode: 400, statusMessage: 'Project id is required' })
  const existing = await getProjectWithCurrentTimeline(projectId)
  if (!existing) throw createError({ statusCode: 404, statusMessage: 'Project not found' })
  if (existing.project.mediaType !== 'av') throw createError({ statusCode: 400, statusMessage: 'Asset intelligence requires an AV project' })

  const rawLimit = Number(getQuery(event).limit ?? 50)
  const limit = Number.isFinite(rawLimit) ? rawLimit : 50
  const jobs = await listProjectIntelligenceJobs(projectId, limit)
  return { jobs }
})
