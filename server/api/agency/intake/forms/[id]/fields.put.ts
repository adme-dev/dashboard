/**
 * Update Intake Form Fields
 * PUT /api/agency/intake/forms/:id/fields
 *
 * Replaces all fields with the provided array
 */

import { queryOne, queryRows } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

interface FormField {
  id?: string
  fieldKey: string
  label: string
  description?: string
  placeholder?: string
  fieldType: string
  options?: Array<{ value: string; label: string }>
  isRequired?: boolean
  minLength?: number
  maxLength?: number
  minValue?: number
  maxValue?: number
  pattern?: string
  allowedFileTypes?: string[]
  maxFileSize?: number
  showWhen?: { fieldKey: string; operator: string; value: any }
  sortOrder?: number
  width?: 'full' | 'half' | 'third'
  mapsTo?: string
}

interface UpdateFieldsBody {
  fields: FormField[]
}

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const formId = getRouterParam(event, 'id')

  if (!formId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Form ID is required'
    })
  }

  const body = await readBody<UpdateFieldsBody>(event)

  if (!body.fields || !Array.isArray(body.fields)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Fields array is required'
    })
  }

  try {
    // Check form exists
    const form = await queryOne(`
      SELECT id FROM intake_forms WHERE id = $1
    `, [formId])

    if (!form) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Form not found'
      })
    }

    // Delete existing fields
    await queryOne(`
      DELETE FROM intake_form_fields WHERE form_id = $1
    `, [formId])

    // Insert new fields
    const fields: any[] = []
    for (let i = 0; i < body.fields.length; i++) {
      const f = body.fields[i]!

      if (!f.fieldKey || !f.label || !f.fieldType) {
        throw createError({
          statusCode: 400,
          statusMessage: `Field at index ${i} is missing required properties (fieldKey, label, fieldType)`
        })
      }

      const field = await queryOne(`
        INSERT INTO intake_form_fields (
          form_id,
          field_key,
          label,
          description,
          placeholder,
          field_type,
          options,
          is_required,
          min_length,
          max_length,
          min_value,
          max_value,
          pattern,
          allowed_file_types,
          max_file_size,
          show_when,
          sort_order,
          width,
          maps_to
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
        RETURNING *
      `, [
        formId,
        f.fieldKey,
        f.label,
        f.description || null,
        f.placeholder || null,
        f.fieldType,
        f.options ? JSON.stringify(f.options) : null,
        f.isRequired ?? false,
        f.minLength || null,
        f.maxLength || null,
        f.minValue || null,
        f.maxValue || null,
        f.pattern || null,
        f.allowedFileTypes || null,
        f.maxFileSize || null,
        f.showWhen ? JSON.stringify(f.showWhen) : null,
        f.sortOrder ?? i,
        f.width || 'full',
        f.mapsTo || null
      ])
      fields.push(field)
    }

    // Update form timestamp
    await queryOne(`
      UPDATE intake_forms SET updated_at = NOW() WHERE id = $1
    `, [formId])

    return {
      success: true,
      fields: fields.map(f => ({
        id: f.id,
        fieldKey: f.field_key,
        label: f.label,
        description: f.description,
        placeholder: f.placeholder,
        fieldType: f.field_type,
        options: f.options,
        isRequired: f.is_required,
        sortOrder: f.sort_order,
        width: f.width,
        mapsTo: f.maps_to
      }))
    }
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Failed to update form fields:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to update form fields'
    })
  }
})
