/**
 * Create Project Template
 * POST /api/agency/templates
 */

import { queryOne } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const body = await readBody(event)

  const {
    name,
    description,
    category,
    tags,
    defaultBudgetType,
    defaultBudgetAmount,
    estimatedDurationDays,
    estimatedHours,
    defaultHourlyRate,
    defaultBillingMethod,
    isPublic = false,
    departmentId
  } = body

  if (!name) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Template name is required'
    })
  }

  try {
    const template = await queryOne(`
      INSERT INTO project_templates (
        name,
        description,
        category,
        tags,
        default_budget_type,
        default_budget_amount,
        estimated_duration_days,
        estimated_hours,
        default_hourly_rate,
        default_billing_method,
        is_public,
        department_id,
        created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *
    `, [
      name,
      description || null,
      category || null,
      tags || null,
      defaultBudgetType || null,
      defaultBudgetAmount || null,
      estimatedDurationDays || null,
      estimatedHours || null,
      defaultHourlyRate || null,
      defaultBillingMethod || 'hourly',
      isPublic,
      departmentId || null,
      user.id
    ])

    return {
      template: {
        id: template.id,
        name: template.name,
        description: template.description,
        category: template.category,
        tags: template.tags,
        defaultBudgetType: template.default_budget_type,
        defaultBudgetAmount: Number(template.default_budget_amount || 0),
        estimatedDurationDays: template.estimated_duration_days,
        estimatedHours: Number(template.estimated_hours || 0),
        isPublic: template.is_public,
        createdAt: template.created_at
      }
    }
  } catch (error) {
    console.error('Failed to create template:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to create template'
    })
  }
})
