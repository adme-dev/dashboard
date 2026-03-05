/**
 * Edit Proof Details
 * PATCH /api/agency/proofs/:id
 */

import { queryOne } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

interface PatchBody {
  name?: string
  description?: string
  dueDate?: string | null
  isUrgent?: boolean
  proofType?: string
  settings?: {
    requiresAllApprovers?: boolean
    allowComments?: boolean
    allowAnnotations?: boolean
  }
}

const VALID_PROOF_TYPES = ['design', 'video', 'document', 'website', 'email', 'social', 'print']

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const proofId = getRouterParam(event, 'id')

  if (!proofId) {
    throw createError({ statusCode: 400, statusMessage: 'Proof ID is required' })
  }

  const body = await readBody<PatchBody>(event)

  // Validate proof type if provided
  if (body.proofType && !VALID_PROOF_TYPES.includes(body.proofType)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid proof type' })
  }

  try {
    // Verify proof exists
    const proof = await queryOne(`SELECT id, created_by FROM creative_proofs WHERE id = $1`, [proofId])
    if (!proof) {
      throw createError({ statusCode: 404, statusMessage: 'Proof not found' })
    }

    // Build dynamic update
    const sets: string[] = []
    const params: any[] = []
    let idx = 1

    if (body.name !== undefined) {
      sets.push(`name = $${idx++}`)
      params.push(body.name)
    }
    if (body.description !== undefined) {
      sets.push(`description = $${idx++}`)
      params.push(body.description)
    }
    if (body.dueDate !== undefined) {
      sets.push(`due_date = $${idx++}`)
      params.push(body.dueDate || null)
    }
    if (body.isUrgent !== undefined) {
      sets.push(`is_urgent = $${idx++}`)
      params.push(body.isUrgent)
    }
    if (body.proofType !== undefined) {
      sets.push(`proof_type = $${idx++}`)
      params.push(body.proofType)
    }
    if (body.settings) {
      if (body.settings.requiresAllApprovers !== undefined) {
        sets.push(`requires_all_approvers = $${idx++}`)
        params.push(body.settings.requiresAllApprovers)
      }
      if (body.settings.allowComments !== undefined) {
        sets.push(`allow_comments = $${idx++}`)
        params.push(body.settings.allowComments)
      }
      if (body.settings.allowAnnotations !== undefined) {
        sets.push(`allow_annotations = $${idx++}`)
        params.push(body.settings.allowAnnotations)
      }
    }

    if (sets.length === 0) {
      throw createError({ statusCode: 400, statusMessage: 'No fields to update' })
    }

    sets.push('updated_at = NOW()')
    params.push(proofId)

    const updated = await queryOne(`
      UPDATE creative_proofs
      SET ${sets.join(', ')}
      WHERE id = $${idx}
      RETURNING *
    `, params)

    // Log activity
    await queryOne(`
      INSERT INTO proof_activities (proof_id, actor_type, team_member_id, activity_type, description)
      VALUES ($1, 'team_member', $2, 'edited', 'Proof details updated')
    `, [proofId, user.id])

    return { success: true, proof: updated }
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Failed to update proof:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to update proof' })
  }
})
