/**
 * Get Invitation Details (by token, for accept page)
 * GET /api/auth/invitations/[token]
 */

import { queryOne, queryRows } from '~~/server/utils/db'

export default defineEventHandler(async (event) => {
  const token = getRouterParam(event, 'token')

  if (!token) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invitation token is required'
    })
  }

  try {
    const invitation = await queryOne(`
      SELECT
        i.id,
        i.email,
        i.user_role,
        i.department_ids,
        i.message,
        i.status,
        i.expires_at,
        inviter.name as inviter_name,
        inviter.email as inviter_email
      FROM team_invitations i
      JOIN team_members inviter ON i.invited_by = inviter.id
      WHERE i.token = $1
    `, [token])

    if (!invitation) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Invitation not found'
      })
    }

    // Check if expired or already used
    if (invitation.status !== 'pending') {
      throw createError({
        statusCode: 400,
        statusMessage: invitation.status === 'accepted'
          ? 'This invitation has already been accepted'
          : invitation.status === 'revoked'
            ? 'This invitation has been revoked'
            : 'This invitation has expired'
      })
    }

    if (new Date(invitation.expires_at) < new Date()) {
      throw createError({
        statusCode: 400,
        statusMessage: 'This invitation has expired'
      })
    }

    // Get department names
    let departments: { id: string; name: string; color: string }[] = []
    if (invitation.department_ids?.length) {
      departments = await queryRows(`
        SELECT id, name, color FROM departments
        WHERE id = ANY($1) AND is_active = true
      `, [invitation.department_ids])
    }

    return {
      email: invitation.email,
      role: invitation.user_role,
      departments,
      message: invitation.message,
      expiresAt: invitation.expires_at,
      inviter: {
        name: invitation.inviter_name,
        email: invitation.inviter_email
      }
    }
  } catch (error: any) {
    if (error.statusCode) throw error

    console.error('Failed to fetch invitation:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch invitation'
    })
  }
})
