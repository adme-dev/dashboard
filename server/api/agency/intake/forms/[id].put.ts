/**
 * Update Intake Form
 * PUT /api/agency/intake/forms/:id
 */

import { queryOne, queryRows } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

interface UpdateFormBody {
  name?: string
  slug?: string
  description?: string
  logoUrl?: string
  headerImageUrl?: string
  primaryColor?: string
  isActive?: boolean
  isPublic?: boolean
  requiresClientLogin?: boolean
  defaultDepartmentId?: string | null
  notifyOnSubmission?: string[]
  autoCreateProject?: boolean
  autoProjectTemplateId?: string | null
  allowedClientIds?: string[]
  confirmationMessage?: string
  confirmationRedirectUrl?: string
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

  const body = await readBody<UpdateFormBody>(event)

  try {
    // Check form exists
    const existing = await queryOne(`
      SELECT id, slug FROM intake_forms WHERE id = $1
    `, [formId])

    if (!existing) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Form not found'
      })
    }

    // Check slug uniqueness if changing
    if (body.slug && body.slug !== existing.slug) {
      const slugExists = await queryOne(`
        SELECT id FROM intake_forms WHERE slug = $1 AND id != $2
      `, [body.slug, formId])

      if (slugExists) {
        throw createError({
          statusCode: 409,
          statusMessage: 'A form with this slug already exists'
        })
      }
    }

    // Build update query
    const updates: string[] = []
    const params: any[] = []
    let idx = 1

    if (body.name !== undefined) {
      updates.push(`name = $${idx++}`)
      params.push(body.name)
    }

    if (body.slug !== undefined) {
      updates.push(`slug = $${idx++}`)
      params.push(body.slug)
    }

    if (body.description !== undefined) {
      updates.push(`description = $${idx++}`)
      params.push(body.description)
    }

    if (body.logoUrl !== undefined) {
      updates.push(`logo_url = $${idx++}`)
      params.push(body.logoUrl)
    }

    if (body.headerImageUrl !== undefined) {
      updates.push(`header_image_url = $${idx++}`)
      params.push(body.headerImageUrl)
    }

    if (body.primaryColor !== undefined) {
      updates.push(`primary_color = $${idx++}`)
      params.push(body.primaryColor)
    }

    if (body.isActive !== undefined) {
      updates.push(`is_active = $${idx++}`)
      params.push(body.isActive)
    }

    if (body.isPublic !== undefined) {
      updates.push(`is_public = $${idx++}`)
      params.push(body.isPublic)
    }

    if (body.requiresClientLogin !== undefined) {
      updates.push(`requires_client_login = $${idx++}`)
      params.push(body.requiresClientLogin)
    }

    if (body.defaultDepartmentId !== undefined) {
      updates.push(`default_department_id = $${idx++}`)
      params.push(body.defaultDepartmentId)
    }

    if (body.notifyOnSubmission !== undefined) {
      updates.push(`notify_on_submission = $${idx++}`)
      params.push(body.notifyOnSubmission)
    }

    if (body.autoCreateProject !== undefined) {
      updates.push(`auto_create_project = $${idx++}`)
      params.push(body.autoCreateProject)
    }

    if (body.autoProjectTemplateId !== undefined) {
      updates.push(`auto_project_template_id = $${idx++}`)
      params.push(body.autoProjectTemplateId)
    }

    if (body.allowedClientIds !== undefined) {
      updates.push(`allowed_client_ids = $${idx++}`)
      params.push(body.allowedClientIds)
    }

    if (body.confirmationMessage !== undefined) {
      updates.push(`confirmation_message = $${idx++}`)
      params.push(body.confirmationMessage)
    }

    if (body.confirmationRedirectUrl !== undefined) {
      updates.push(`confirmation_redirect_url = $${idx++}`)
      params.push(body.confirmationRedirectUrl)
    }

    if (updates.length === 0) {
      return {
        success: true,
        message: 'No changes provided'
      }
    }

    updates.push('updated_at = NOW()')
    params.push(formId)

    const form = await queryOne(`
      UPDATE intake_forms
      SET ${updates.join(', ')}
      WHERE id = $${idx}
      RETURNING *
    `, params)

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
        updatedAt: form.updated_at
      }
    }
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Failed to update intake form:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to update intake form'
    })
  }
})
