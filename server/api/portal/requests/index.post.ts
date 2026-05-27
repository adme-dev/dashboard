/**
 * Client Portal - Create Request
 * POST /api/portal/requests
 */

import { queryOne, queryRows, transaction } from '~~/server/utils/db'
import { requireClientAuth } from '~~/server/utils/clientAuth'
import { createNotification } from '~~/server/utils/notifications'
import { normalizeClientRequestAttachments } from '~~/server/utils/clientRequestAttachments'

const JOB_CATEGORIES = ['new_project', 'additional_work', 'revision', 'content', 'design', 'development', 'strategy', 'other']
const SUPPORT_CATEGORIES = ['billing', 'access', 'bug', 'question', 'feedback', 'other']
const PRIORITIES = ['low', 'normal', 'high', 'urgent']

type StaffNotificationRecipient = {
  id: string
}

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

  const normalizedEstimatedBudget = estimatedBudget == null || estimatedBudget === ''
    ? null
    : Number(estimatedBudget)
  if (normalizedEstimatedBudget != null && (!Number.isFinite(normalizedEstimatedBudget) || normalizedEstimatedBudget < 0)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid estimated budget' })
  }

  const normalizedDesiredDeadline = desiredDeadline == null || desiredDeadline === ''
    ? null
    : String(desiredDeadline)
  if (
    normalizedDesiredDeadline
    && (!/^\d{4}-\d{2}-\d{2}$/.test(normalizedDesiredDeadline) || Number.isNaN(Date.parse(`${normalizedDesiredDeadline}T00:00:00Z`)))
  ) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid desired deadline' })
  }

  const normalizedAttachments = normalizeClientRequestAttachments(attachments)

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

    const result = await transaction(async (client) => {
      const inserted = await client.query(`
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
        JSON.stringify(normalizedAttachments),
        normalizedEstimatedBudget,
        normalizedDesiredDeadline
      ])

      const request = inserted.rows[0]

      await client.query(`
        INSERT INTO client_activity_log (
          client_user_id, client_id, action, entity_type, entity_id, details
        ) VALUES ($1, $2, 'client_request_submitted', 'client_request', $3, $4)
      `, [
        clientUser.id,
        clientUser.clientId,
        request.id,
        JSON.stringify({
          requestType,
          category: category || null,
          priority: priority || 'normal',
          title: title.trim()
        })
      ])

      return request
    })

    try {
      const recipients = await queryRows<StaffNotificationRecipient>(`
        SELECT DISTINCT tm.id
        FROM team_members tm
        WHERE tm.is_active = true
          AND (
            tm.user_role IN ('owner', 'admin', 'lead', 'project_manager', 'account_manager')
            OR tm.id = (
              SELECT p.project_manager_id
              FROM projects p
              WHERE p.id = $1
                AND p.client_id = $2
            )
          )
        ORDER BY tm.id
        LIMIT 10
      `, [projectId || null, clientUser.clientId])

      await Promise.all(recipients.map(recipient => createNotification({
        userId: recipient.id,
        type: 'team_update',
        title: 'New client request submitted',
        message: `"${title.trim()}" was submitted from the client portal.`,
        link: `/agency/client-portal?tab=requests&requestId=${result.id}`,
        metadata: {
          clientId: clientUser.clientId,
          requestId: result.id,
          requestType,
          priority: priority || 'normal'
        },
        reason: 'direct'
      })))
    } catch (notificationError) {
      console.warn('Failed to notify staff about client request:', notificationError)
    }

    return {
      id: result.id,
      createdAt: result.created_at
    }
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'statusCode' in error) throw error
    console.error('Failed to create request:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to create request' })
  }
})
