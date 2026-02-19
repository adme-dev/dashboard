/**
 * Submit Approval Response by Token (Public)
 * POST /api/approve/:token
 *
 * Allows clients to approve/reject via token without logging in
 *
 * Body:
 * - action: 'approve' | 'reject' | 'request_revision'
 * - notes: Optional response notes
 * - responderName: Name of person responding (for record keeping)
 * - responderEmail: Email of person responding (optional)
 */

import { queryOne, transaction } from '~~/server/utils/db'
import { createNotification } from '~~/server/utils/notifications'

interface ResponseBody {
  action: 'approve' | 'reject' | 'request_revision'
  notes?: string
  responderName?: string
  responderEmail?: string
}

export default defineEventHandler(async (event) => {
  const token = getRouterParam(event, 'token')
  const body = await readBody<ResponseBody>(event)

  if (!token || token.length !== 64) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid approval token'
    })
  }

  const { action, notes, responderName, responderEmail } = body

  if (!action || !['approve', 'reject', 'request_revision'].includes(action)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Valid action is required (approve, reject, request_revision)'
    })
  }

  try {
    // Find approval by token
    const approval = await queryOne(`
      SELECT
        ca.id,
        ca.status,
        ca.title,
        ca.approval_type,
        ca.requested_by,
        ca.token_expires_at,
        p.id as project_id,
        p.name as project_name,
        p.client_id
      FROM client_approvals ca
      JOIN projects p ON ca.project_id = p.id
      WHERE ca.approval_token = $1
    `, [token])

    if (!approval) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Approval not found or token is invalid'
      })
    }

    // Check token expiration
    if (approval.token_expires_at && new Date(approval.token_expires_at) < new Date()) {
      throw createError({
        statusCode: 410,
        statusMessage: 'This approval link has expired. Please request a new link from your contact.'
      })
    }

    if (approval.status !== 'pending') {
      throw createError({
        statusCode: 400,
        statusMessage: `This approval has already been ${approval.status.replace('_', ' ')}`
      })
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
      // Build response notes with responder info
      const fullNotes = [
        notes,
        responderName ? `Responded by: ${responderName}` : null,
        responderEmail ? `Email: ${responderEmail}` : null,
        'Submitted via external approval link'
      ].filter(Boolean).join('\n\n')

      // Update approval
      const result = await client.query(`
        UPDATE client_approvals
        SET
          status = $1,
          responded_at = NOW(),
          response_notes = $2,
          approval_token = NULL,
          token_expires_at = NULL,
          updated_at = NOW()
        WHERE id = $3
        RETURNING *
      `, [newStatus, fullNotes, approval.id])

      updatedApproval = result.rows[0]

      // Log activity
      await client.query(`
        INSERT INTO client_activity_log (
          client_id,
          action,
          entity_type,
          entity_id,
          details
        ) VALUES ($1, $2, 'approval', $3, $4)
      `, [
        approval.client_id,
        `external_approval_${action}`,
        approval.id,
        JSON.stringify({
          approvalTitle: approval.title,
          projectName: approval.project_name,
          responderName,
          responderEmail,
          notes,
          method: 'token_link'
        })
      ])
    })

    // Send notification to team member who requested
    if (approval.requested_by) {
      try {
        const actionText = action === 'approve' ? 'approved' :
          action === 'reject' ? 'rejected' : 'requested revisions on'

        await createNotification({
          userId: approval.requested_by,
          type: 'approval_response',
          title: `Approval ${action === 'approve' ? 'Approved' : action === 'reject' ? 'Rejected' : 'Revision Requested'}`,
          message: `${responderName || 'Client'} ${actionText} "${approval.title}" for ${approval.project_name}`,
          link: `/agency/workflow?approvalId=${approval.id}`,
          metadata: {
            approvalId: approval.id,
            action,
            projectId: approval.project_id
          }
        })
      } catch (notifyError) {
        console.error('Failed to send approval response notification:', notifyError)
      }
    }

    return {
      success: true,
      approval: {
        id: updatedApproval.id,
        status: updatedApproval.status,
        respondedAt: updatedApproval.responded_at
      },
      message: action === 'approve'
        ? 'Thank you! Your approval has been recorded.'
        : action === 'reject'
          ? 'Your feedback has been recorded. The team will follow up with you.'
          : 'Your revision request has been sent to the team.'
    }
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Failed to submit approval response:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to submit approval response'
    })
  }
})
