/**
 * Add Approvers to Proof
 * POST /api/agency/proofs/:id/approvers
 */

import { queryOne, queryRows } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

interface AddApproverBody {
  approvers: Array<{
    type: 'team_member' | 'client_contact'
    id: string
    role?: string
  }>
}

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const proofId = getRouterParam(event, 'id')

  if (!proofId) {
    throw createError({ statusCode: 400, statusMessage: 'Proof ID is required' })
  }

  const body = await readBody<AddApproverBody>(event)

  if (!body.approvers || !Array.isArray(body.approvers) || body.approvers.length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'At least one approver is required' })
  }

  try {
    // Verify proof exists
    const proof = await queryOne(`SELECT id FROM creative_proofs WHERE id = $1`, [proofId])
    if (!proof) {
      throw createError({ statusCode: 404, statusMessage: 'Proof not found' })
    }

    const created: any[] = []
    for (const approver of body.approvers) {
      if (!approver.id || !['team_member', 'client_contact'].includes(approver.type)) continue

      // Check for duplicate
      const existing = approver.type === 'team_member'
        ? await queryOne(`SELECT id FROM proof_approvers WHERE proof_id = $1 AND team_member_id = $2`, [proofId, approver.id])
        : await queryOne(`SELECT id FROM proof_approvers WHERE proof_id = $1 AND client_contact_id = $2`, [proofId, approver.id])

      if (existing) continue

      const teamMemberId = approver.type === 'team_member' ? approver.id : null
      const clientContactId = approver.type === 'client_contact' ? approver.id : null

      const row = await queryOne(`
        INSERT INTO proof_approvers (proof_id, approver_type, team_member_id, client_contact_id, role, status)
        VALUES ($1, $2, $3, $4, $5, 'pending')
        RETURNING *
      `, [proofId, approver.type, teamMemberId, clientContactId, approver.role || null])

      created.push(row)
    }

    // Log activity
    if (created.length > 0) {
      await queryOne(`
        INSERT INTO proof_activities (proof_id, actor_type, team_member_id, activity_type, description)
        VALUES ($1, 'team_member', $2, 'approver_added', $3)
      `, [proofId, user.id, `${created.length} approver(s) added`])
    }

    return {
      success: true,
      added: created.length,
      approvers: created.map(a => ({
        id: a.id,
        type: a.approver_type,
        teamMemberId: a.team_member_id,
        clientContactId: a.client_contact_id,
        role: a.role,
        status: a.status
      }))
    }
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Failed to add approvers:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to add approvers' })
  }
})
