import { requireAuth } from '~~/server/utils/auth'
import { dissectionSnapshot, loadDissection } from '~~/server/utils/banner/dissectionJobs'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)

  const jobId = getRouterParam(event, 'jobId')
  if (!jobId) {
    throw createError({ statusCode: 400, statusMessage: 'Missing jobId' })
  }

  return dissectionSnapshot(await loadDissection(jobId, user.id))
})
