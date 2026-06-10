import { requireWriteAccess } from '~~/server/utils/auth'
import { getVideoGenerationJob } from '~~/server/utils/video-generation/jobs'

export default defineEventHandler(async (event) => {
  if (process.env.VIDEO_GENERATION_ENABLED !== 'true') {
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  }
  await requireWriteAccess(event)
  const id = getRouterParam(event, 'id')!
  const job = await getVideoGenerationJob(id)
  if (!job) throw createError({ statusCode: 404, statusMessage: 'Generation job not found' })
  return { job }
})
