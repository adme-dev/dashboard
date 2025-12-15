/**
 * Create New Project
 * POST /api/agency/projects
 */

import { queryOne } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const body = await readBody(event)

  const {
    name,
    description,
    clientId,
    budgetAmount,
    budgetType = 'fixed',
    startDate,
    endDate,
    projectManagerId
  } = body

  // Validation
  if (!name?.trim()) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Project name is required'
    })
  }

  if (!clientId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Client is required'
    })
  }

  if (!budgetAmount || budgetAmount <= 0) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Budget amount must be greater than 0'
    })
  }

  if (!startDate) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Start date is required'
    })
  }

  try {
    // Verify client exists
    const client = await queryOne('SELECT id, name FROM agency_clients WHERE id = $1', [clientId])
    if (!client) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Client not found'
      })
    }

    // Create project
    const project = await queryOne(`
      INSERT INTO projects (
        name, description, client_id, budget_amount, budget_type,
        start_date, end_date, project_manager_id, status
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'draft')
      RETURNING *
    `, [
      name.trim(),
      description?.trim() || null,
      clientId,
      budgetAmount,
      budgetType,
      startDate,
      endDate || null,
      projectManagerId || null
    ])

    return {
      success: true,
      project: {
        id: project.id,
        name: project.name,
        description: project.description,
        clientId: project.client_id,
        clientName: client.name,
        budgetAmount: Number(project.budget_amount),
        budgetType: project.budget_type,
        startDate: project.start_date,
        endDate: project.end_date,
        status: project.status,
        projectManagerId: project.project_manager_id,
        createdAt: project.created_at
      }
    }
  } catch (error: any) {
    console.error('Failed to create project:', error)
    if (error.statusCode) throw error
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to create project'
    })
  }
})
