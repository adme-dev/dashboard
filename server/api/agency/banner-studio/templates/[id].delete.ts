import { queryOne, execute } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Template ID is required' })
  }

  try {
    const template = await queryOne('SELECT id, is_system FROM banner_templates WHERE id = $1', [id])
    if (!template) {
      throw createError({ statusCode: 404, statusMessage: 'Template not found' })
    }

    if (template.is_system) {
      throw createError({ statusCode: 403, statusMessage: 'Cannot delete system templates' })
    }

    await execute('DELETE FROM banner_templates WHERE id = $1', [id])

    return { success: true, message: 'Template deleted' }
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Failed to delete banner template:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to delete banner template' })
  }
})
