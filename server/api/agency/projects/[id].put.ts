/**
 * Update Project
 * PUT /api/agency/projects/:id
 */

import { queryOne } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const id = getRouterParam(event, 'id')
  const body = await readBody(event)

  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Project ID is required'
    })
  }

  const {
    name,
    description,
    clientId,
    budgetAmount,
    budgetType,
    startDate,
    endDate,
    status,
    projectManagerId
  } = body

  try {
    // Check project exists
    const existing = await queryOne('SELECT id FROM projects WHERE id = $1', [id])
    if (!existing) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Project not found'
      })
    }

    // Build update query dynamically
    const updates: string[] = []
    const params: any[] = []
    let paramIndex = 1

    if (name !== undefined) {
      updates.push(`name = $${paramIndex}`)
      params.push(name)
      paramIndex++
    }

    if (description !== undefined) {
      updates.push(`description = $${paramIndex}`)
      params.push(description)
      paramIndex++
    }

    if (clientId !== undefined) {
      updates.push(`client_id = $${paramIndex}`)
      params.push(clientId)
      paramIndex++
    }

    if (budgetAmount !== undefined) {
      updates.push(`budget_amount = $${paramIndex}`)
      params.push(budgetAmount)
      paramIndex++
    }

    if (budgetType !== undefined) {
      updates.push(`budget_type = $${paramIndex}`)
      params.push(budgetType)
      paramIndex++
    }

    if (startDate !== undefined) {
      updates.push(`start_date = $${paramIndex}`)
      params.push(startDate)
      paramIndex++
    }

    if (endDate !== undefined) {
      updates.push(`end_date = $${paramIndex}`)
      params.push(endDate || null)
      paramIndex++
    }

    if (status !== undefined) {
      updates.push(`status = $${paramIndex}`)
      params.push(status)
      paramIndex++
    }

    if (projectManagerId !== undefined) {
      updates.push(`project_manager_id = $${paramIndex}`)
      params.push(projectManagerId || null)
      paramIndex++
    }

    if (updates.length === 0) {
      throw createError({
        statusCode: 400,
        statusMessage: 'No fields to update'
      })
    }

    params.push(id)
    const sql = `
      UPDATE projects
      SET ${updates.join(', ')}, updated_at = NOW()
      WHERE id = $${paramIndex}
      RETURNING *
    `

    const project = await queryOne(sql, params)

    return {
      success: true,
      project: {
        id: project.id,
        name: project.name,
        description: project.description,
        clientId: project.client_id,
        budgetAmount: Number(project.budget_amount),
        budgetType: project.budget_type,
        startDate: project.start_date,
        endDate: project.end_date,
        status: project.status,
        projectManagerId: project.project_manager_id,
        updatedAt: project.updated_at
      }
    }
  } catch (error: any) {
    console.error('Failed to update project:', error)
    if (error.statusCode) throw error
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to update project'
    })
  }
})
