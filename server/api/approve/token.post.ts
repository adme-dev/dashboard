/**
 * Generate Approval Token
 * POST /api/approve/token
 *
 * Creates a secure, time-limited approval token for external approval
 *
 * Body:
 * - approvalId: The approval request ID
 * - expiresInHours: Token validity (24-168 hours, default 72)
 */

import { queryOne } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'
import { randomBytes } from 'crypto'

interface TokenBody {
  approvalId: string
  expiresInHours?: number
}

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const body = await readBody<TokenBody>(event)

  const { approvalId, expiresInHours = 72 } = body

  if (!approvalId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Approval ID is required'
    })
  }

  // Validate expiration time (between 24 and 168 hours / 1 week)
  const validHours = Math.min(Math.max(expiresInHours, 24), 168)

  try {
    // Verify approval exists and is pending
    const approval = await queryOne(`
      SELECT
        ca.id,
        ca.status,
        ca.title,
        ca.approval_token,
        ca.token_expires_at,
        p.id as project_id,
        p.name as project_name,
        c.id as client_id,
        c.name as client_name
      FROM client_approvals ca
      JOIN projects p ON ca.project_id = p.id
      JOIN agency_clients c ON p.client_id = c.id
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
        statusMessage: `Cannot generate token for ${approval.status} approval`
      })
    }

    // Generate a secure random token (32 bytes = 64 hex chars)
    const token = randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + validHours * 60 * 60 * 1000)

    // Update approval with token
    await queryOne(`
      UPDATE client_approvals
      SET
        approval_token = $1,
        token_expires_at = $2,
        updated_at = NOW()
      WHERE id = $3
    `, [token, expiresAt.toISOString(), approvalId])

    // Build the approval URL
    const config = useRuntimeConfig()
    const baseUrl = config.public?.appUrl || process.env.NUXT_PUBLIC_APP_URL || 'http://localhost:3000'
    const approvalUrl = `${baseUrl}/approve/${token}`

    return {
      success: true,
      token,
      approvalUrl,
      expiresAt: expiresAt.toISOString(),
      expiresInHours: validHours,
      approval: {
        id: approval.id,
        title: approval.title,
        projectName: approval.project_name,
        clientName: approval.client_name
      }
    }
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Failed to generate approval token:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to generate approval token'
    })
  }
})
