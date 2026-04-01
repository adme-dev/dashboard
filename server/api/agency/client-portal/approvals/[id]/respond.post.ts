/**
 * Respond to Approval (Client Action)
 * POST /api/agency/client-portal/approvals/:id/respond
 *
 * Body:
 * - action: 'approve' | 'reject' | 'request_revision'
 * - notes: Optional response notes
 * - clientUserId: The client user responding (for agency testing)
 */

import { queryOne, transaction } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

// Notification function stub
async function sendApprovalResponseNotification(_params: any) {
  // TODO: Integrate with notification system
}

interface RespondBody {
  action: 'approve' | 'reject' | 'request_revision'
  notes?: string
  clientUserId?: string // For agency-side testing
}

export default defineEventHandler(async (event) => {
  const agencyUser = await requireAuth(event)
  const approvalId = getRouterParam(event, 'id')
  const body = await readBody<RespondBody>(event)

  if (!approvalId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Approval ID is required'
    })
  }

  const { action, notes, clientUserId } = body

  if (!action || !['approve', 'reject', 'request_revision'].includes(action)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Valid action is required (approve, reject, request_revision)'
    })
  }

  try {
    // Get approval
    const approval = await queryOne(`
      SELECT
        ca.id,
        ca.status,
        ca.title,
        ca.approval_type,
        ca.requested_by,
        p.id as project_id,
        p.name as project_name,
        p.client_id
      FROM client_approvals ca
      JOIN projects p ON ca.project_id = p.id
      WHERE ca.id = $1
    `, [approvalId])

    if (!approval) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Approval not found'
      })
    }

    if (approval.status !== 'pending') {
      throw createError({
        statusCode: 400,
        statusMessage: `This approval has already been ${approval.status}`
      })
    }

    // If clientUserId provided, verify it belongs to this client
    let responderId = clientUserId
    if (responderId) {
      const clientUser = await queryOne(`
        SELECT id FROM client_users
        WHERE id = $1 AND client_id = $2 AND status = 'active' AND can_approve_work = true
      `, [responderId, approval.client_id])

      if (!clientUser) {
        throw createError({
          statusCode: 403,
          statusMessage: 'Client user not authorized to approve'
        })
      }
    }

    // Map action to status
    const statusMap: Record<string, string> = {
      approve: 'approved',
      reject: 'rejected',
      request_revision: 'revision_requested'
    }
    const newStatus = statusMap[action] || 'pending'

    let updatedApproval: any

    await transaction(async (client) => {
      // Update approval
      const result = await client.query(`
        UPDATE client_approvals
        SET
          status = $1,
          responded_at = NOW(),
          responded_by = $2,
          response_notes = $3,
          updated_at = NOW()
        WHERE id = $4
        RETURNING *
      `, [newStatus, responderId || null, notes || null, approvalId])

      updatedApproval = result.rows[0]

      // Log activity
      await client.query(`
        INSERT INTO client_activity_log (
          client_user_id,
          client_id,
          action,
          entity_type,
          entity_id,
          details
        ) VALUES ($1, $2, $3, 'approval', $4, $5)
      `, [
        responderId || null,
        approval.client_id,
        `approval_${action}`,
        approvalId,
        JSON.stringify({
          approvalTitle: approval.title,
          projectName: approval.project_name,
          notes
        })
      ])
    })

    // Send notification to team member who requested
    try {
      await sendApprovalResponseNotification({
        approvalId,
        approvalTitle: approval.title,
        projectName: approval.project_name,
        action,
        notes,
        requestedById: approval.requested_by
      })
    } catch (notifyError) {
      console.error('Failed to send approval response notification:', notifyError)
    }

    return {
      success: true,
      approval: {
        id: updatedApproval.id,
        status: updatedApproval.status,
        respondedAt: updatedApproval.responded_at,
        responseNotes: updatedApproval.response_notes
      },
      message: `Approval has been ${newStatus.replace('_', ' ')}`
    }
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Failed to respond to approval:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to respond to approval'
    })
  }
})
