import { requireWriteAccess } from '~~/server/utils/auth'
import { deleteProject } from '~~/server/utils/audio/projects'

// DELETE /api/agency/audio/projects/:id — removes the project plus its versioned
// timelines (FK cascade) and render jobs (deleted explicitly first — their
// timeline_id FK has no cascade). All in one transaction inside deleteProject.
export default defineEventHandler(async (event) => {
  await requireWriteAccess(event)
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Project ID is required' })
  }

  const deleted = await deleteProject(id)
  if (!deleted) {
    throw createError({ statusCode: 404, statusMessage: 'Project not found' })
  }

  return { success: true }
})
