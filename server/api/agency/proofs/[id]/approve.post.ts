/**
 * Approve/Reject Proof (for approvers)
 * POST /api/agency/proofs/:id/approve
 */

import { queryOne, queryRows } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

interface ApproveBody {
  decision: 'approved' | 'rejected' | 'changes_requested'
  comment?: string
}

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const proofId = getRouterParam(event, 'id')

  if (!proofId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Proof ID is required'
    })
  }

  const body = await readBody<ApproveBody>(event)

  if (!body.decision || !['approved', 'rejected', 'changes_requested'].includes(body.decision)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid decision. Must be: approved, rejected, or changes_requested'
    })
  }

  try {
    // Get proof
    const proof = await queryOne(`
      SELECT * FROM creative_proofs WHERE id = $1
    `, [proofId])

    if (!proof) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Proof not found'
      })
    }

    // Find the approver record for this user
    const approver = await queryOne(`
      SELECT * FROM proof_approvers
      WHERE proof_id = $1 AND team_member_id = $2
    `, [proofId, user.id])

    if (!approver) {
      throw createError({
        statusCode: 403,
        statusMessage: 'You are not an approver for this proof'
      })
    }

    // Update approver decision
    const updated = await queryOne(`
      UPDATE proof_approvers
      SET
        status = $1,
        decision_at = NOW(),
        decision_comment = $2
      WHERE id = $3
      RETURNING *
    `, [body.decision, body.comment || null, approver.id])

    // Log activity
    await queryOne(`
      INSERT INTO proof_activities (
        proof_id,
        actor_type,
        team_member_id,
        activity_type,
        description,
        metadata
      ) VALUES ($1, 'team_member', $2, $3, $4, $5)
    `, [
      proofId,
      user.id,
      body.decision,
      `${body.decision === 'approved' ? 'Approved' : body.decision === 'rejected' ? 'Rejected' : 'Requested changes'}${body.comment ? ': ' + body.comment : ''}`,
      JSON.stringify({ decision: body.decision, comment: body.comment })
    ])

    // Check if all approvals are in and update proof status
    const approvers = await queryRows(`
      SELECT status FROM proof_approvers WHERE proof_id = $1
    `, [proofId])

    const allDecided = approvers.every((a: any) => a.status !== 'pending')
    const allApproved = approvers.every((a: any) => a.status === 'approved')
    const anyRejected = approvers.some((a: any) => a.status === 'rejected')
    const anyChangesRequested = approvers.some((a: any) => a.status === 'changes_requested')

    let newProofStatus = proof.status
    if (proof.requires_all_approvers) {
      // All must approve
      if (allDecided) {
        if (allApproved) {
          newProofStatus = 'approved'
        } else if (anyRejected) {
          newProofStatus = 'rejected'
        } else if (anyChangesRequested) {
          newProofStatus = 'changes_requested'
        }
      }
    } else {
      // Any can approve (first decision wins for that type)
      if (body.decision === 'approved') {
        newProofStatus = 'approved'
      } else if (body.decision === 'rejected') {
        newProofStatus = 'rejected'
      } else if (body.decision === 'changes_requested') {
        newProofStatus = 'changes_requested'
      }
    }

    // Update proof status if changed
    if (newProofStatus !== proof.status) {
      await queryOne(`
        UPDATE creative_proofs SET status = $1, updated_at = NOW() WHERE id = $2
      `, [newProofStatus, proofId])

      await queryOne(`
        INSERT INTO proof_activities (
          proof_id,
          actor_type,
          activity_type,
          description,
          metadata
        ) VALUES ($1, 'system', 'status_changed', $2, $3)
      `, [
        proofId,
        `Proof status changed to ${newProofStatus}`,
        JSON.stringify({ from: proof.status, to: newProofStatus, reason: 'approval_decision' })
      ])
    }

    return {
      success: true,
      approval: {
        id: updated.id,
        status: updated.status,
        decisionAt: updated.decision_at,
        decisionComment: updated.decision_comment
      },
      proof: {
        id: proofId,
        status: newProofStatus,
        statusChanged: newProofStatus !== proof.status
      }
    }
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Failed to process approval:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to process approval'
    })
  }
})
