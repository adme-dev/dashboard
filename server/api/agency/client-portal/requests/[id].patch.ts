/**
 * Agency - Update Client Request
 * PATCH /api/agency/client-portal/requests/:id
 */

import { queryOne } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const requestId = getRouterParam(event, 'id')

  if (!requestId) {
    throw createError({ statusCode: 400, statusMessage: 'Request ID is required' })
  }

  const body = await readBody(event)
  const { status, assignedTo, projectId, taskId, responseNotes, priority } = body

  const VALID_STATUSES = ['submitted', 'in_review', 'approved', 'in_progress', 'completed', 'closed', 'cancelled']
  const VALID_PRIORITIES = ['low', 'normal', 'high', 'urgent']

  if (status && !VALID_STATUSES.includes(status)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid status' })
  }
  if (priority && !VALID_PRIORITIES.includes(priority)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid priority' })
  }

  try {
    // Verify request exists
    const existing = await queryOne('SELECT id, status FROM client_requests WHERE id = $1', [requestId])
    if (!existing) {
      throw createError({ statusCode: 404, statusMessage: 'Request not found' })
    }

    const updates: string[] = []
    const params: any[] = []
    let idx = 1

    if (status) {
      updates.push(`status = $${idx}`)
      params.push(status)
      idx++

      // Set responded_by/responded_at on first status change from submitted
      if (existing.status === 'submitted' && status !== 'submitted') {
        updates.push(`responded_by = $${idx}`)
        params.push(user.id)
        idx++
        updates.push(`responded_at = NOW()`)
      }

      // Set resolved_at when completed or closed
      if (['completed', 'closed'].includes(status)) {
        updates.push(`resolved_at = NOW()`)
      }
    }

    if (assignedTo !== undefined) {
      updates.push(`assigned_to = $${idx}`)
      params.push(assignedTo || null)
      idx++
    }

    if (projectId !== undefined) {
      updates.push(`project_id = $${idx}`)
      params.push(projectId || null)
      idx++
    }

    if (taskId !== undefined) {
      updates.push(`task_id = $${idx}`)
      params.push(taskId || null)
      idx++
    }

    if (responseNotes !== undefined) {
      updates.push(`response_notes = $${idx}`)
      params.push(responseNotes || null)
      idx++
    }

    if (priority) {
      updates.push(`priority = $${idx}`)
      params.push(priority)
      idx++
    }

    if (updates.length === 0) {
      throw createError({ statusCode: 400, statusMessage: 'No fields to update' })
    }

    params.push(requestId)
    const updated = await queryOne(`
      UPDATE client_requests
      SET ${updates.join(', ')}
      WHERE id = $${idx}
      RETURNING id, status, updated_at
    `, params)

    return {
      id: updated.id,
      status: updated.status,
      updatedAt: updated.updated_at
    }
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Failed to update request:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to update request' })
  }
})
