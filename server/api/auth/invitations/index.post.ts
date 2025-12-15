/**
 * Send Team Invitation
 * POST /api/auth/invitations
 */

import { queryOne, queryRows } from '~~/server/utils/db'
import { requireRole, generateToken, logActivity } from '~~/server/utils/auth'
import { sendInvitationEmail } from '~~/server/utils/email'

interface InvitationBody {
  email: string
  role?: 'admin' | 'member' | 'viewer' | 'guest'
  departmentIds?: string[]
  message?: string
}

export default defineEventHandler(async (event) => {
  // Only admins and owners can invite
  const user = await requireRole(event, ['owner', 'admin'])

  const body = await readBody<InvitationBody>(event)

  if (!body.email) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Email is required'
    })
  }

  const email = body.email.toLowerCase().trim()
  const role = body.role || 'member'

  // Validate role
  if (!['admin', 'member', 'viewer', 'guest'].includes(role)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid role'
    })
  }

  // Only owners can invite admins
  if (role === 'admin' && user.role !== 'owner') {
    throw createError({
      statusCode: 403,
      statusMessage: 'Only owners can invite admins'
    })
  }

  try {
    // Check if user already exists
    const existingUser = await queryOne(
      'SELECT id FROM team_members WHERE email = $1',
      [email]
    )

    if (existingUser) {
      throw createError({
        statusCode: 409,
        statusMessage: 'A user with this email already exists'
      })
    }

    // Check for existing pending invitation
    const existingInvitation = await queryOne(`
      SELECT id FROM team_invitations
      WHERE email = $1 AND status = 'pending' AND expires_at > NOW()
    `, [email])

    if (existingInvitation) {
      throw createError({
        statusCode: 409,
        statusMessage: 'An invitation has already been sent to this email'
      })
    }

    // Validate departments if provided
    let departmentNames: string[] = []
    if (body.departmentIds?.length) {
      const departments = await queryRows(`
        SELECT id, name FROM departments
        WHERE id = ANY($1) AND is_active = true
      `, [body.departmentIds])

      if (departments.length !== body.departmentIds.length) {
        throw createError({
          statusCode: 400,
          statusMessage: 'One or more departments not found'
        })
      }

      departmentNames = departments.map(d => d.name)
    }

    // Create invitation token
    const token = generateToken()
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days

    // Save invitation
    const invitation = await queryOne(`
      INSERT INTO team_invitations (
        email, invited_by, user_role, department_ids, token, message, expires_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id
    `, [
      email,
      user.id,
      role,
      body.departmentIds || [],
      token,
      body.message || null,
      expiresAt
    ])

    // Get inviter details
    const inviter = await queryOne(
      'SELECT name, email FROM team_members WHERE id = $1',
      [user.id]
    )

    // Send invitation email
    await sendInvitationEmail({
      to: email,
      inviterName: inviter.name,
      inviterEmail: inviter.email,
      role,
      departments: departmentNames,
      message: body.message,
      token,
      expiresAt
    })

    // Log activity
    await logActivity({
      userId: user.id,
      action: 'invitation_sent',
      resourceType: 'invitation',
      resourceId: invitation.id,
      newValues: { email, role, departmentIds: body.departmentIds },
      event
    })

    return {
      success: true,
      invitation: {
        id: invitation.id,
        email,
        role,
        departmentIds: body.departmentIds || [],
        expiresAt
      }
    }
  } catch (error: any) {
    if (error.statusCode) throw error

    console.error('Invitation error:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to send invitation'
    })
  }
})
