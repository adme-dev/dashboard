import { requireWriteAccess } from '~~/server/utils/auth'
import { cancelDissection } from '~~/server/utils/banner/dissectionJobs'

export default defineEventHandler(async (event) => {
  const user = await requireWriteAccess(event)
  const jobId = getRouterParam(event, 'jobId')
  if (!jobId) throw createError({ statusCode: 400, statusMessage: 'Missing jobId' })
  return await cancelDissection(jobId, user.id)
})
