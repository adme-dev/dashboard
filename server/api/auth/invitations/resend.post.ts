/**
 * Resend Team Invitation
 * POST /api/auth/invitations/resend
 */

import { queryOne, queryRows } from '~~/server/utils/db'
import { requireRole, generateToken, logActivity } from '~~/server/utils/auth'
import { sendInvitationEmail } from '~~/server/utils/email'

interface ResendBody {
  id: string
}

export default defineEventHandler(async (event) => {
  const user = await requireRole(event, ['owner', 'admin'])
  const body = await readBody<ResendBody>(event)

  if (!body.id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invitation ID is required'
    })
  }

  try {
    // Get invitation
    const invitation = await queryOne(`
      SELECT
        i.id,
        i.email,
        i.user_role,
        i.department_ids,
        i.message,
        i.status,
        inviter.id as inviter_id,
        inviter.name as inviter_name,
        inviter.email as inviter_email
      FROM team_invitations i
      JOIN team_members inviter ON i.invited_by = inviter.id
      WHERE i.id = $1
    `, [body.id])

    if (!invitation) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Invitation not found'
      })
    }

    if (invitation.status !== 'pending') {
      throw createError({
        statusCode: 400,
        statusMessage: 'Only pending invitations can be resent'
      })
    }

    // Generate new token and extend expiry
    const newToken = generateToken()
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days

    await queryOne(`
      UPDATE team_invitations
      SET token = $1, expires_at = $2
      WHERE id = $3
    `, [newToken, expiresAt, body.id])

    // Get department names
    let departmentNames: string[] = []
    if (invitation.department_ids?.length) {
      const departments = await queryRows(`
        SELECT name FROM departments WHERE id = ANY($1)
      `, [invitation.department_ids])
      departmentNames = departments.map(d => d.name)
    }

    // Send new invitation email
    await sendInvitationEmail({
      to: invitation.email,
      inviterName: invitation.inviter_name,
      inviterEmail: invitation.inviter_email,
      role: invitation.user_role,
      departments: departmentNames,
      message: invitation.message,
      token: newToken,
      expiresAt
    })

    // Log activity
    await logActivity({
      userId: user.id,
      action: 'invitation_resent',
      resourceType: 'invitation',
      resourceId: body.id,
      newValues: { email: invitation.email, expiresAt },
      event
    })

    return {
      success: true,
      message: 'Invitation resent',
      expiresAt
    }
  } catch (error: any) {
    if (error.statusCode) throw error

    console.error('Failed to resend invitation:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to resend invitation'
    })
  }
})
