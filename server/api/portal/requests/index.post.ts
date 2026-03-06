/**
 * Client Portal - Create Request
 * POST /api/portal/requests
 */

import { queryOne } from '~~/server/utils/db'
import { requireClientAuth } from '~~/server/utils/clientAuth'

const JOB_CATEGORIES = ['new_project', 'additional_work', 'revision', 'content', 'design', 'development', 'strategy', 'other']
const SUPPORT_CATEGORIES = ['billing', 'access', 'bug', 'question', 'feedback', 'other']
const PRIORITIES = ['low', 'normal', 'high', 'urgent']

export default defineEventHandler(async (event) => {
  const clientUser = await requireClientAuth(event)

  if (!clientUser.permissions.canSubmitRequests) {
    throw createError({ statusCode: 403, statusMessage: 'You do not have permission to submit requests' })
  }

  const body = await readBody(event)

  const { requestType, category, title, description, priority, projectId, attachments, estimatedBudget, desiredDeadline } = body

  // Validate request type
  if (!requestType || !['job_request', 'support_ticket'].includes(requestType)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid request type' })
  }

  // Validate title and description
  if (!title?.trim() || !description?.trim()) {
    throw createError({ statusCode: 400, statusMessage: 'Title and description are required' })
  }

  // Validate category against whitelist
  if (category) {
    const validCategories = requestType === 'job_request' ? JOB_CATEGORIES : SUPPORT_CATEGORIES
    if (!validCategories.includes(category)) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid category' })
    }
  }

  // Validate priority
  if (priority && !PRIORITIES.includes(priority)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid priority' })
  }

  try {
    // If projectId provided, verify it belongs to this client
    if (projectId) {
      const project = await queryOne(
        'SELECT id FROM projects WHERE id = $1 AND client_id = $2',
        [projectId, clientUser.clientId]
      )
      if (!project) {
        throw createError({ statusCode: 400, statusMessage: 'Invalid project' })
      }
    }

    const result = await queryOne(`
      INSERT INTO client_requests (
        client_id, client_user_id, request_type, category, title, description,
        priority, project_id, attachments, estimated_budget, desired_deadline
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING id, created_at
    `, [
      clientUser.clientId,
      clientUser.id,
      requestType,
      category || null,
      title.trim(),
      description.trim(),
      priority || 'normal',
      projectId || null,
      JSON.stringify(attachments || []),
      estimatedBudget || null,
      desiredDeadline || null
    ])

    return {
      id: result.id,
      createdAt: result.created_at
    }
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Failed to create request:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to create request' })
  }
})
