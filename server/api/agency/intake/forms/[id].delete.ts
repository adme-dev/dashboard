/**
 * Delete Intake Form
 * DELETE /api/agency/intake/forms/:id
 */

import { queryOne } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const formId = getRouterParam(event, 'id')

  if (!formId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Form ID is required'
    })
  }

  try {
    // Check form exists and get submission count
    const existing = await queryOne(`
      SELECT
        f.id,
        f.name,
        (SELECT COUNT(*) FROM intake_submissions WHERE form_id = f.id) AS submission_count
      FROM intake_forms f
      WHERE f.id = $1
    `, [formId])

    if (!existing) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Form not found'
      })
    }

    // Warn if form has submissions
    if (Number(existing.submission_count) > 0) {
      // Soft delete by deactivating instead
      await queryOne(`
        UPDATE intake_forms SET is_active = false, updated_at = NOW() WHERE id = $1 RETURNING id
      `, [formId])

      return {
        success: true,
        message: `Form "${existing.name}" deactivated (has ${existing.submission_count} submissions)`,
        deactivated: true
      }
    }

    // Hard delete if no submissions
    await queryOne(`
      DELETE FROM intake_forms WHERE id = $1 RETURNING id
    `, [formId])

    return {
      success: true,
      message: `Form "${existing.name}" deleted successfully`,
      deleted: true
    }
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Failed to delete intake form:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to delete intake form'
    })
  }
})
