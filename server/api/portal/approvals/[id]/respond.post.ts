/**
 * Client Portal - Respond to Approval
 * POST /api/portal/approvals/:id/respond
 * Body: { action: 'approve' | 'reject' | 'revision_requested', notes?: string }
 */

import { queryOne, execute, transaction } from '~~/server/utils/db'
import { requireClientAuth } from '~~/server/utils/clientAuth'

export default defineEventHandler(async (event) => {
  const clientUser = await requireClientAuth(event)

  if (!clientUser.permissions.canApproveWork) {
    throw createError({ statusCode: 403, statusMessage: 'You do not have permission to respond to approvals' })
  }

  const approvalId = getRouterParam(event, 'id')
  if (!approvalId) {
    throw createError({ statusCode: 400, statusMessage: 'Approval ID is required' })
  }

  const body = await readBody(event)
  const { action, notes } = body

  if (!action || !['approve', 'reject', 'revision_requested'].includes(action)) {
    throw createError({ statusCode: 400, statusMessage: 'Valid action is required (approve, reject, revision_requested)' })
  }

  if ((action === 'reject' || action === 'revision_requested') && !notes) {
    throw createError({ statusCode: 400, statusMessage: 'Notes are required when rejecting or requesting revision' })
  }

  try {
    // Verify approval belongs to client and is pending
    const approval = await queryOne(`
      SELECT ca.id, ca.status, p.client_id
      FROM client_approvals ca
      JOIN projects p ON ca.project_id = p.id
      WHERE ca.id = $1 AND p.client_id = $2
    `, [approvalId, clientUser.clientId])

    if (!approval) {
      throw createError({ statusCode: 404, statusMessage: 'Approval not found' })
    }

    if (approval.status !== 'pending') {
      throw createError({ statusCode: 400, statusMessage: `Approval has already been ${approval.status}` })
    }

    const statusMap: Record<string, string> = {
      approve: 'approved',
      reject: 'rejected',
      revision_requested: 'revision_requested'
    }

    await transaction(async (client) => {
      await client.query(`
        UPDATE client_approvals
        SET status = $1, responded_by = $2, responded_at = NOW(), response_notes = $3
        WHERE id = $4
      `, [statusMap[action], clientUser.id, notes || null, approvalId])

      await client.query(`
        INSERT INTO client_activity_log (client_user_id, client_id, action, entity_type, entity_id, details)
        VALUES ($1, $2, $3, 'approval', $4, $5)
      `, [clientUser.id, clientUser.clientId, `approval_${action}`, approvalId, JSON.stringify({ notes })])
    })

    return {
      success: true,
      status: statusMap[action]
    }
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Failed to respond to approval:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to respond to approval' })
  }
})
