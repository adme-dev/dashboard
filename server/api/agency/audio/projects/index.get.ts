import { z } from 'zod'
import { requireAuth } from '~~/server/utils/auth'
import { listProjects } from '~~/server/utils/audio/projects'
import { projectCovers } from '~~/server/utils/audio/projectCovers'

const QuerySchema = z.object({
  clientId: z.string().uuid().optional()
})

export default defineEventHandler(async (event) => {
  const actor = await requireAuth(event)
  const q = QuerySchema.parse(getQuery(event))
  const projects = await listProjects(q.clientId, actor)
  const covers = await projectCovers(projects, actor)
  return { projects: projects.map(project => ({ ...project, cover: covers.get(project.id) ?? null })) }
})
