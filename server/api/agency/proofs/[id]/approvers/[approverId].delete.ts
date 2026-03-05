/**
 * Remove Approver from Proof
 * DELETE /api/agency/proofs/:id/approvers/:approverId
 */

import { queryOne, execute } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const proofId = getRouterParam(event, 'id')
  const approverId = getRouterParam(event, 'approverId')

  if (!proofId || !approverId) {
    throw createError({ statusCode: 400, statusMessage: 'Proof ID and Approver ID are required' })
  }

  try {
    // Verify proof exists
    const proof = await queryOne(`SELECT id FROM creative_proofs WHERE id = $1`, [proofId])
    if (!proof) {
      throw createError({ statusCode: 404, statusMessage: 'Proof not found' })
    }

    // Verify approver exists on this proof
    const approver = await queryOne(`
      SELECT id FROM proof_approvers WHERE id = $1 AND proof_id = $2
    `, [approverId, proofId])

    if (!approver) {
      throw createError({ statusCode: 404, statusMessage: 'Approver not found on this proof' })
    }

    // Delete the approver
    await execute(`DELETE FROM proof_approvers WHERE id = $1`, [approverId])

    // Log activity
    await queryOne(`
      INSERT INTO proof_activities (proof_id, actor_type, team_member_id, activity_type, description)
      VALUES ($1, 'team_member', $2, 'approver_removed', 'Approver removed')
    `, [proofId, user.id])

    return { success: true }
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Failed to remove approver:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to remove approver' })
  }
})
