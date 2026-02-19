/**
 * Update Proof Status
 * PUT /api/agency/proofs/:id/status
 */

import { queryOne } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

interface UpdateStatusBody {
  status: 'draft' | 'internal_review' | 'client_review' | 'changes_requested' | 'approved' | 'rejected' | 'archived'
}

const VALID_STATUSES = ['draft', 'internal_review', 'client_review', 'changes_requested', 'approved', 'rejected', 'archived']

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const proofId = getRouterParam(event, 'id')

  if (!proofId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Proof ID is required'
    })
  }

  const body = await readBody<UpdateStatusBody>(event)

  if (!body.status || !VALID_STATUSES.includes(body.status)) {
    throw createError({
      statusCode: 400,
      statusMessage: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}`
    })
  }

  try {
    // Get existing proof
    const existing = await queryOne(`
      SELECT id, name, status FROM creative_proofs WHERE id = $1
    `, [proofId])

    if (!existing) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Proof not found'
      })
    }

    if (existing.status === body.status) {
      return {
        success: true,
        message: 'Status unchanged'
      }
    }

    // Update status
    const proof = await queryOne(`
      UPDATE creative_proofs
      SET status = $1, updated_at = NOW()
      WHERE id = $2
      RETURNING *
    `, [body.status, proofId])

    // Log activity
    await queryOne(`
      INSERT INTO proof_activities (
        proof_id,
        actor_type,
        team_member_id,
        activity_type,
        description,
        metadata
      ) VALUES ($1, 'team_member', $2, 'status_changed', $3, $4)
    `, [
      proofId,
      user.id,
      `Status changed from ${existing.status} to ${body.status}`,
      JSON.stringify({ from: existing.status, to: body.status })
    ])

    return {
      success: true,
      proof: {
        id: proof.id,
        name: proof.name,
        status: proof.status,
        previousStatus: existing.status,
        updatedAt: proof.updated_at
      }
    }
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Failed to update proof status:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to update proof status'
    })
  }
})
