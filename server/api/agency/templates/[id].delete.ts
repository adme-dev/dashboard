/**
 * Delete Template
 * DELETE /api/agency/templates/:id
 */

import { queryOne, queryRows } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Template ID is required'
    })
  }

  try {
    // Check if template exists
    const existing = await queryOne(
      'SELECT id, name, times_used FROM project_templates WHERE id = $1',
      [id]
    )

    if (!existing) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Template not found'
      })
    }

    // Delete related data first (cascade)
    await queryRows('DELETE FROM template_documents WHERE template_id = $1', [id])
    await queryRows('DELETE FROM template_roles WHERE template_id = $1', [id])
    await queryRows('DELETE FROM template_tasks WHERE template_id = $1', [id])
    await queryRows('DELETE FROM template_phases WHERE template_id = $1', [id])

    // Delete the template
    await queryOne(
      'DELETE FROM project_templates WHERE id = $1 RETURNING id',
      [id]
    )

    return {
      success: true,
      message: `Template "${existing.name}" deleted`
    }
  } catch (error: any) {
    console.error('Failed to delete template:', error)
    if (error.statusCode) throw error
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to delete template'
    })
  }
})
