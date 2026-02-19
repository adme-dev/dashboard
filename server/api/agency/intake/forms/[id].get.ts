/**
 * Get Intake Form Details
 * GET /api/agency/intake/forms/:id
 */

import { queryOne, queryRows } from '~~/server/utils/db'
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
    const form = await queryOne(`
      SELECT
        f.*,
        d.name AS department_name,
        tm.name AS created_by_name,
        pt.name AS template_name
      FROM intake_forms f
      LEFT JOIN departments d ON f.default_department_id = d.id
      LEFT JOIN team_members tm ON f.created_by = tm.id
      LEFT JOIN project_templates pt ON f.auto_project_template_id = pt.id
      WHERE f.id = $1
    `, [formId])

    if (!form) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Form not found'
      })
    }

    // Get fields
    const fields = await queryRows(`
      SELECT *
      FROM intake_form_fields
      WHERE form_id = $1
      ORDER BY sort_order
    `, [formId])

    // Get submission stats
    const stats = await queryOne(`
      SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE status = 'pending') AS pending,
        COUNT(*) FILTER (WHERE status = 'reviewing') AS reviewing,
        COUNT(*) FILTER (WHERE status = 'approved') AS approved,
        COUNT(*) FILTER (WHERE status = 'converted') AS converted,
        COUNT(*) FILTER (WHERE status = 'rejected') AS rejected
      FROM intake_submissions
      WHERE form_id = $1
    `, [formId])

    return {
      form: {
        id: form.id,
        name: form.name,
        slug: form.slug,
        description: form.description,
        logoUrl: form.logo_url,
        headerImageUrl: form.header_image_url,
        primaryColor: form.primary_color,
        isActive: form.is_active,
        isPublic: form.is_public,
        requiresClientLogin: form.requires_client_login,
        department: form.default_department_id ? {
          id: form.default_department_id,
          name: form.department_name
        } : null,
        notifyOnSubmission: form.notify_on_submission,
        autoCreateProject: form.auto_create_project,
        autoProjectTemplateId: form.auto_project_template_id,
        templateName: form.template_name,
        allowedClientIds: form.allowed_client_ids,
        confirmationMessage: form.confirmation_message,
        confirmationRedirectUrl: form.confirmation_redirect_url,
        createdBy: form.created_by,
        createdByName: form.created_by_name,
        publicUrl: `/intake/${form.slug}`,
        createdAt: form.created_at,
        updatedAt: form.updated_at
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
        width: f.width,
        mapsTo: f.maps_to
      })),
      stats: {
        total: Number(stats?.total || 0),
        pending: Number(stats?.pending || 0),
        reviewing: Number(stats?.reviewing || 0),
        approved: Number(stats?.approved || 0),
        converted: Number(stats?.converted || 0),
        rejected: Number(stats?.rejected || 0)
      }
    }
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Failed to fetch intake form:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch intake form'
    })
  }
})
