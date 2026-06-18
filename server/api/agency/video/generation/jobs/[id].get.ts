import { requireWriteAccess } from '~~/server/utils/auth'
import { getProjectWithCurrentTimeline } from '~~/server/utils/audio/projects'
import { getVideoGenerationJob } from '~~/server/utils/video-generation/jobs'
import { canUseVideoGenerationProject } from '~~/server/utils/video-generation/timelineStillSource'

export default defineEventHandler(async (event) => {
  if (process.env.VIDEO_GENERATION_ENABLED !== 'true') {
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  }
  const user = await requireWriteAccess(event)
  const id = getRouterParam(event, 'id')!
  const job = await getVideoGenerationJob(id)
  if (!job) throw createError({ statusCode: 404, statusMessage: 'Generation job not found' })
  const project = await getProjectWithCurrentTimeline(job.projectId)
  if (!project) throw createError({ statusCode: 404, statusMessage: 'Project not found' })
  if (project.project.mediaType !== 'av') {
    throw createError({ statusCode: 400, statusMessage: 'Video generation requires an AV project' })
  }
  if (!canUseVideoGenerationProject(user, project.project)) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  }
  return { job }
})
