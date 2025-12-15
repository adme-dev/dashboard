/**
 * Revoke/Cancel Invitation
 * DELETE /api/auth/invitations/[id]
 */

import { queryOne } from '~~/server/utils/db'
import { requireRole, logActivity } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  const user = await requireRole(event, ['owner', 'admin'])
  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invitation ID is required'
    })
  }

  try {
    // Get invitation
    const invitation = await queryOne(`
      SELECT id, email, status FROM team_invitations WHERE id = $1
    `, [id])

    if (!invitation) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Invitation not found'
      })
    }

    if (invitation.status !== 'pending') {
      throw createError({
        statusCode: 400,
        statusMessage: 'Only pending invitations can be revoked'
      })
    }

    // Revoke invitation
    await queryOne(`
      UPDATE team_invitations SET status = 'revoked' WHERE id = $1
    `, [id])

    // Log activity
    await logActivity({
      userId: user.id,
      action: 'invitation_revoked',
      resourceType: 'invitation',
      resourceId: id,
      oldValues: { email: invitation.email, status: 'pending' },
      newValues: { status: 'revoked' },
      event
    })

    return {
      success: true,
      message: 'Invitation revoked'
    }
  } catch (error: any) {
    if (error.statusCode) throw error

    console.error('Failed to revoke invitation:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to revoke invitation'
    })
  }
})
