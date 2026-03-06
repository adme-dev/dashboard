/**
 * Bulk replace all fields for a brief template (for drag-and-drop field builder)
 */

import { transaction } from '~~/server/utils/db'
import { requireAuth, requireRole } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  await requireRole(event, ['admin', 'owner'])

  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Template ID is required' })
  }

  const body = await readBody(event)
  const { fields } = body

  if (!Array.isArray(fields)) {
    throw createError({ statusCode: 400, statusMessage: 'Fields must be an array' })
  }

  try {
    const result = await transaction(async (client) => {
      // Verify template exists
      const tmplCheck = await client.query(
        'SELECT id FROM brief_templates WHERE id = $1', [id]
      )
      if (tmplCheck.rows.length === 0) {
        throw createError({ statusCode: 404, statusMessage: 'Template not found' })
      }

      // Delete all existing fields
      await client.query('DELETE FROM brief_template_fields WHERE template_id = $1', [id])

      // Insert new fields
      const insertedFields = []
      for (let i = 0; i < fields.length; i++) {
        const f = fields[i]
        const result = await client.query(`
          INSERT INTO brief_template_fields (
            template_id, field_key, field_label, field_type, placeholder, help_text,
            default_value, is_required, validation_rules, options, conditional_logic,
            step_number, step_title, section, width, sort_order,
            show_in_preview, show_in_list
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
          RETURNING id
        `, [
          id,
          f.fieldKey || `field_${i}`,
          f.fieldLabel || `Field ${i + 1}`,
          f.fieldType || 'text',
          f.placeholder || null,
          f.helpText || null,
          f.defaultValue !== undefined ? JSON.stringify(f.defaultValue) : null,
          f.isRequired ?? false,
          f.validationRules ? JSON.stringify(f.validationRules) : null,
          f.options ? JSON.stringify(f.options) : null,
          f.conditionalLogic ? JSON.stringify(f.conditionalLogic) : null,
          f.stepNumber ?? 1,
          f.stepTitle || null,
          f.section || null,
          f.width || 'full',
          f.sortOrder ?? i,
          f.showInPreview ?? true,
          f.showInList ?? false
        ])
        insertedFields.push(result.rows[0])
      }

      // Update template updated_at
      await client.query(
        'UPDATE brief_templates SET updated_at = NOW() WHERE id = $1', [id]
      )

      return insertedFields
    })

    return { success: true, fieldCount: result.length }
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Failed to update brief template fields:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to update template fields' })
  }
})
