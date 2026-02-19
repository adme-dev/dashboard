/**
 * Create New Version of Proof
 * POST /api/agency/proofs/:id/version
 */

import { queryOne } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const proofId = getRouterParam(event, 'id')

  if (!proofId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Proof ID is required'
    })
  }

  try {
    // Check proof exists
    const existing = await queryOne(`
      SELECT id, name, version FROM creative_proofs WHERE id = $1
    `, [proofId])

    if (!existing) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Proof not found'
      })
    }

    // Create new version using the database function
    const result = await queryOne(`
      SELECT create_proof_version($1, $2) AS new_proof_id
    `, [proofId, user.id])

    if (!result?.new_proof_id) {
      throw createError({
        statusCode: 500,
        statusMessage: 'Failed to create proof version'
      })
    }

    // Get the new proof
    const newProof = await queryOne(`
      SELECT * FROM creative_proofs WHERE id = $1
    `, [result.new_proof_id])

    return {
      success: true,
      proof: {
        id: newProof.id,
        name: newProof.name,
        version: newProof.version,
        status: newProof.status,
        parentProofId: newProof.parent_proof_id,
        createdAt: newProof.created_at
      },
      previousVersion: {
        id: existing.id,
        version: existing.version
      }
    }
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Failed to create proof version:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to create proof version'
    })
  }
})
