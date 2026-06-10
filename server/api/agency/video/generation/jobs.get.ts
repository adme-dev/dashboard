import { requireWriteAccess } from '~~/server/utils/auth'
import { listVideoGenerationJobsForProject } from '~~/server/utils/video-generation/jobs'

export default defineEventHandler(async (event) => {
  if (process.env.VIDEO_GENERATION_ENABLED !== 'true') {
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  }
  await requireWriteAccess(event)
  const projectId = String(getQuery(event).projectId ?? '')
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(projectId)) {
    throw createError({ statusCode: 400, statusMessage: 'Valid projectId required' })
  }
  const jobs = await listVideoGenerationJobsForProject(projectId)
  return { jobs }
})
