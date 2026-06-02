import { z } from 'zod'
import { requireAuth } from '~~/server/utils/auth'
import { listProjects } from '~~/server/utils/audio/projects'

const QuerySchema = z.object({
  // .guid() = 8-4-4-4-12 hex without RFC-9562 variant/version bit enforcement;
  // zod 4's stricter .uuid() rejects non-conformant-but-valid client ids.
  clientId: z.string().guid().optional()
})

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const q = QuerySchema.parse(getQuery(event))
  const projects = await listProjects(q.clientId)
  return { projects }
})
