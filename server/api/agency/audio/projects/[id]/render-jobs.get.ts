import { requireAuth } from '~~/server/utils/auth'
import { listRenderJobs } from '~~/server/utils/audio/projects'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const id = getRouterParam(event, 'id')!
  const jobs = await listRenderJobs(id)
  return { jobs }
})
