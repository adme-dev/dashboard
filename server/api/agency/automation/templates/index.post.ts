/**
 * Create Email Template
 * POST /api/agency/automation/templates
 */

import { queryOne } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

interface CreateTemplateBody {
  name: string
  description?: string
  category?: string
  subjectTemplate: string
  bodyTemplate: string
  plainTextTemplate?: string
  availableVariables?: Array<{ name: string; description: string }>
  isActive?: boolean
}

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const body = await readBody<CreateTemplateBody>(event)

  // Validation
  if (!body.name?.trim()) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Template name is required'
    })
  }

  if (!body.subjectTemplate?.trim()) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Subject template is required'
    })
  }

  if (!body.bodyTemplate?.trim()) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Body template is required'
    })
  }

  try {
    const template = await queryOne(`
      INSERT INTO email_templates (
        name,
        description,
        category,
        subject_template,
        body_template,
        plain_text_template,
        available_variables,
        is_system,
        is_active,
        created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, false, $8, $9)
      RETURNING *
    `, [
      body.name.trim(),
      body.description || null,
      body.category || null,
      body.subjectTemplate,
      body.bodyTemplate,
      body.plainTextTemplate || null,
      JSON.stringify(body.availableVariables || []),
      body.isActive ?? true,
      user.id
    ])

    return {
      success: true,
      template: {
        id: template.id,
        name: template.name,
        description: template.description,
        category: template.category,
        subjectTemplate: template.subject_template,
        bodyTemplate: template.body_template,
        plainTextTemplate: template.plain_text_template,
        availableVariables: template.available_variables,
        isSystem: template.is_system,
        isActive: template.is_active,
        createdAt: template.created_at
      }
    }
  } catch (error) {
    console.error('Failed to create email template:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to create email template'
    })
  }
})
