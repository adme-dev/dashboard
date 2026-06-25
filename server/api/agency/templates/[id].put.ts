/**
 * Update Template
 * PUT /api/agency/templates/:id
 */

import { queryOne } from '~~/server/utils/db'
import { requireWriteAccess } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  await requireWriteAccess(event)
  const id = getRouterParam(event, 'id')
  const body = await readBody(event)

  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Template ID is required'
    })
  }

  try {
    // Check if template exists
    const existing = await queryOne(
      'SELECT id FROM project_templates WHERE id = $1',
      [id]
    )

    if (!existing) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Template not found'
      })
    }

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
      departmentId,
      isActive,
      isPublic
    } = body

    // Build dynamic update query
    const updates: string[] = []
    const params: Array<string | number | boolean | null | string[]> = []
    let paramIndex = 1

    if (name !== undefined) {
      updates.push(`name = $${paramIndex}`)
      params.push(name)
      paramIndex++
    }
    if (description !== undefined) {
      updates.push(`description = $${paramIndex}`)
      params.push(description || null)
      paramIndex++
    }
    if (category !== undefined) {
      updates.push(`category = $${paramIndex}`)
      params.push(category || null)
      paramIndex++
    }
    if (tags !== undefined) {
      updates.push(`tags = $${paramIndex}`)
      params.push(tags || null)
      paramIndex++
    }
    if (defaultBudgetType !== undefined) {
      updates.push(`default_budget_type = $${paramIndex}`)
      params.push(defaultBudgetType || null)
      paramIndex++
    }
    if (defaultBudgetAmount !== undefined) {
      updates.push(`default_budget_amount = $${paramIndex}`)
      params.push(defaultBudgetAmount || null)
      paramIndex++
    }
    if (estimatedDurationDays !== undefined) {
      updates.push(`estimated_duration_days = $${paramIndex}`)
      params.push(estimatedDurationDays || null)
      paramIndex++
    }
    if (estimatedHours !== undefined) {
      updates.push(`estimated_hours = $${paramIndex}`)
      params.push(estimatedHours || null)
      paramIndex++
    }
    if (defaultHourlyRate !== undefined) {
      updates.push(`default_hourly_rate = $${paramIndex}`)
      params.push(defaultHourlyRate || null)
      paramIndex++
    }
    if (defaultBillingMethod !== undefined) {
      updates.push(`default_billing_method = $${paramIndex}`)
      params.push(defaultBillingMethod || null)
      paramIndex++
    }
    if (departmentId !== undefined) {
      updates.push(`department_id = $${paramIndex}`)
      params.push(departmentId || null)
      paramIndex++
    }
    if (isActive !== undefined) {
      updates.push(`is_active = $${paramIndex}`)
      params.push(isActive)
      paramIndex++
    }
    if (isPublic !== undefined) {
      updates.push(`is_public = $${paramIndex}`)
      params.push(isPublic)
      paramIndex++
    }

    if (updates.length === 0) {
      throw createError({
        statusCode: 400,
        statusMessage: 'No fields to update'
      })
    }

    updates.push('updated_at = NOW()')
    params.push(id)

    const result = await queryOne(`
      UPDATE project_templates
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `, params)

    return {
      template: {
        id: result.id,
        name: result.name,
        description: result.description,
        category: result.category,
        tags: result.tags,
        defaultBudgetType: result.default_budget_type,
        defaultBudgetAmount: Number(result.default_budget_amount || 0),
        estimatedDurationDays: result.estimated_duration_days,
        estimatedHours: Number(result.estimated_hours || 0),
        defaultHourlyRate: Number(result.default_hourly_rate || 0),
        defaultBillingMethod: result.default_billing_method,
        departmentId: result.department_id,
        isActive: result.is_active,
        isPublic: result.is_public,
        updatedAt: result.updated_at
      }
    }
  } catch (error: unknown) {
    console.error('Failed to update template:', error)
    if (error && typeof error === 'object' && 'statusCode' in error) throw error
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to update template'
    })
  }
})
