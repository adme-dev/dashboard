/**
 * Agency - Update Client Request
 * PATCH /api/agency/client-portal/requests/:id
 */

import { queryOne, transaction } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

type UpdateClientRequestBody = {
  status?: string
  assignedTo?: string | null
  projectId?: string | null
  taskId?: string | null
  responseNotes?: string | null
  priority?: string
}

type ClientRequestRow = {
  id: string
  client_id: string
  status: string
}

type UpdatedClientRequestRow = {
  id: string
  status: string
  assigned_to: string | null
  priority: string | null
  updated_at: string
}

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const requestId = getRouterParam(event, 'id')

  if (!requestId) {
    throw createError({ statusCode: 400, statusMessage: 'Request ID is required' })
  }

  const body = await readBody<UpdateClientRequestBody>(event)
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
    const existing = await queryOne<ClientRequestRow>('SELECT id, client_id, status FROM client_requests WHERE id = $1', [requestId])
    if (!existing) {
      throw createError({ statusCode: 404, statusMessage: 'Request not found' })
    }

    const updates: string[] = []
    const params: Array<string | null> = []
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
    const updated = await transaction(async (db) => {
      const updateResult = await db.query<UpdatedClientRequestRow>(`
        UPDATE client_requests
        SET ${updates.join(', ')}
        WHERE id = $${idx}
        RETURNING id, status, assigned_to, priority, updated_at
      `, params)

      const row = updateResult.rows[0]

      await db.query(`
        INSERT INTO client_activity_log (
          client_id,
          action,
          entity_type,
          entity_id,
          details
        ) VALUES ($1, 'agency_request_updated', 'client_request', $2, $3)
      `, [
        existing.client_id,
        requestId,
        JSON.stringify({
          agencyUserId: user.id,
          status: row.status,
          assignedTo: row.assigned_to,
          priority: row.priority
        })
      ])

      return row
    })

    return {
      id: updated.id,
      status: updated.status,
      updatedAt: updated.updated_at
    }
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'statusCode' in error) throw error
    console.error('Failed to update request:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to update request' })
  }
})
