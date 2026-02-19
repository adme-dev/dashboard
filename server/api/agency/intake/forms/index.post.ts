/**
 * Create Intake Form
 * POST /api/agency/intake/forms
 */

import { queryOne, queryRows } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

interface FormField {
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

interface CreateFormBody {
  name: string
  slug?: string
  description?: string
  logoUrl?: string
  headerImageUrl?: string
  primaryColor?: string
  isActive?: boolean
  isPublic?: boolean
  requiresClientLogin?: boolean
  defaultDepartmentId?: string
  notifyOnSubmission?: string[]
  autoCreateProject?: boolean
  autoProjectTemplateId?: string
  allowedClientIds?: string[]
  confirmationMessage?: string
  confirmationRedirectUrl?: string
  fields?: FormField[]
}

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const body = await readBody<CreateFormBody>(event)

  if (!body.name) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Form name is required'
    })
  }

  // Generate slug from name if not provided
  const slug = body.slug || body.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

  try {
    // Check slug uniqueness
    const existingSlug = await queryOne(`
      SELECT id FROM intake_forms WHERE slug = $1
    `, [slug])

    if (existingSlug) {
      throw createError({
        statusCode: 409,
        statusMessage: 'A form with this slug already exists'
      })
    }

    // Create form
    const form = await queryOne(`
      INSERT INTO intake_forms (
        name,
        slug,
        description,
        logo_url,
        header_image_url,
        primary_color,
        is_active,
        is_public,
        requires_client_login,
        default_department_id,
        notify_on_submission,
        auto_create_project,
        auto_project_template_id,
        allowed_client_ids,
        confirmation_message,
        confirmation_redirect_url,
        created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
      RETURNING *
    `, [
      body.name,
      slug,
      body.description || null,
      body.logoUrl || null,
      body.headerImageUrl || null,
      body.primaryColor || '#3B82F6',
      body.isActive ?? true,
      body.isPublic ?? true,
      body.requiresClientLogin ?? false,
      body.defaultDepartmentId || null,
      body.notifyOnSubmission || null,
      body.autoCreateProject ?? false,
      body.autoProjectTemplateId || null,
      body.allowedClientIds || null,
      body.confirmationMessage || 'Thank you for your submission. We\'ll be in touch shortly.',
      body.confirmationRedirectUrl || null,
      user.id
    ])

    // Create fields if provided
    let fields: any[] = []
    if (body.fields && body.fields.length > 0) {
      for (let i = 0; i < body.fields.length; i++) {
        const f = body.fields[i]!
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
          form.id,
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
    }

    return {
      success: true,
      form: {
        id: form.id,
        name: form.name,
        slug: form.slug,
        description: form.description,
        isActive: form.is_active,
        isPublic: form.is_public,
        primaryColor: form.primary_color,
        publicUrl: `/intake/${form.slug}`,
        fieldCount: fields.length,
        createdAt: form.created_at
      }
    }
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Failed to create intake form:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to create intake form'
    })
  }
})
