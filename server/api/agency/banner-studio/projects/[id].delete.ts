import { queryOne, execute } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Project ID is required' })
  }

  try {
    const project = await queryOne('SELECT id FROM banner_projects WHERE id = $1', [id])
    if (!project) {
      throw createError({ statusCode: 404, statusMessage: 'Project not found' })
    }

    await execute('DELETE FROM banner_dissections WHERE project_id = $1', [id])
    await execute('DELETE FROM banner_projects WHERE id = $1', [id])

    return { success: true, message: 'Project deleted' }
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Failed to delete banner project:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to delete banner project' })
  }
})
