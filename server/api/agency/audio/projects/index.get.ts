import { z } from 'zod'
import { requireAuth } from '~~/server/utils/auth'
import { listProjects } from '~~/server/utils/audio/projects'

const QuerySchema = z.object({
  clientId: z.string().uuid().optional()
})

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const q = QuerySchema.parse(getQuery(event))
  const projects = await listProjects(q.clientId)
  return { projects }
})
