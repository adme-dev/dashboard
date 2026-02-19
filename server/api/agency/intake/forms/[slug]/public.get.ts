/**
 * Get Public Intake Form (No Auth Required)
 * GET /api/agency/intake/forms/:slug/public
 *
 * Returns form definition for public submission
 */

import { queryOne, queryRows } from '~~/server/utils/db'

export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug')

  if (!slug) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Form slug is required'
    })
  }

  try {
    const form = await queryOne(`
      SELECT
        f.id,
        f.name,
        f.slug,
        f.description,
        f.logo_url,
        f.header_image_url,
        f.primary_color,
        f.is_active,
        f.is_public,
        f.requires_client_login,
        f.confirmation_message,
        f.confirmation_redirect_url
      FROM intake_forms f
      WHERE f.slug = $1
    `, [slug])

    if (!form) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Form not found'
      })
    }

    if (!form.is_active) {
      throw createError({
        statusCode: 410,
        statusMessage: 'This form is no longer accepting submissions'
      })
    }

    if (!form.is_public) {
      throw createError({
        statusCode: 403,
        statusMessage: 'This form requires authentication'
      })
    }

    // Get fields (only active, public-visible fields)
    const fields = await queryRows(`
      SELECT
        id,
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
        width
      FROM intake_form_fields
      WHERE form_id = $1
      ORDER BY sort_order
    `, [form.id])

    return {
      form: {
        id: form.id,
        name: form.name,
        slug: form.slug,
        description: form.description,
        logoUrl: form.logo_url,
        headerImageUrl: form.header_image_url,
        primaryColor: form.primary_color,
        requiresClientLogin: form.requires_client_login,
        confirmationMessage: form.confirmation_message,
        confirmationRedirectUrl: form.confirmation_redirect_url
      },
      fields: fields.map(f => ({
        id: f.id,
        fieldKey: f.field_key,
        label: f.label,
        description: f.description,
        placeholder: f.placeholder,
        fieldType: f.field_type,
        options: f.options,
        isRequired: f.is_required,
        minLength: f.min_length,
        maxLength: f.max_length,
        minValue: f.min_value,
        maxValue: f.max_value,
        pattern: f.pattern,
        allowedFileTypes: f.allowed_file_types,
        maxFileSize: f.max_file_size,
        showWhen: f.show_when,
        sortOrder: f.sort_order,
        width: f.width
      }))
    }
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Failed to fetch public form:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch form'
    })
  }
})
