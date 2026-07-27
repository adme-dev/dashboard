/**
 * Accept Client Portal Invitation
 * POST /api/portal/auth/accept-invite
 *
 * Body:
 * - token: Invitation token
 * - password: User's chosen password
 */

import { queryOne, transaction } from '~~/server/utils/db'
import bcrypt from 'bcryptjs'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)

  const { token, password } = body

  if (!token) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invitation token is required'
    })
  }

  if (!password || password.length < 8) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Password must be at least 8 characters'
    })
  }

  try {
    // Find invitation
    const invitation = await queryOne(`
      SELECT
        ci.id,
        ci.client_id,
        ci.email,
        ci.name,
        ci.permissions,
        ci.status,
        ci.expires_at,
        ci.accepted_by_user_id,
        c.name as client_name
      FROM client_invitations ci
      JOIN agency_clients c ON ci.client_id = c.id
      WHERE ci.token = $1
    `, [token])

    if (!invitation) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Invalid invitation token'
      })
    }

    if (invitation.status === 'accepted') {
      throw createError({
        statusCode: 400,
        statusMessage: 'This invitation has already been accepted'
      })
    }

    if (invitation.status === 'cancelled') {
      throw createError({
        statusCode: 400,
        statusMessage: 'This invitation has been cancelled'
      })
    }

    if (invitation.status === 'expired' || new Date(invitation.expires_at) < new Date()) {
      throw createError({
        statusCode: 400,
        statusMessage: 'This invitation has expired'
      })
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 12)

    let user: any
    await transaction(async (client) => {
      // Find or create user
      const existingUser = await client.query(`
        SELECT id FROM client_users WHERE email = $1 AND client_id = $2
      `, [invitation.email, invitation.client_id])

      if (existingUser.rows.length > 0) {
        // Update existing user
        const result = await client.query(`
          UPDATE client_users
          SET
            password_hash = $1,
            status = 'active',
            email_verified = true,
            email_verified_at = NOW(),
            activated_at = NOW(),
            updated_at = NOW()
          WHERE id = $2
          RETURNING *
        `, [passwordHash, existingUser.rows[0].id])
        user = result.rows[0]
      } else {
        // Create new user (shouldn't happen normally as invite.post.ts creates them)
        const permissions = invitation.permissions || {}
        const result = await client.query(`
          INSERT INTO client_users (
            client_id, email, name, password_hash, status,
            email_verified, email_verified_at, activated_at,
            can_view_projects, can_view_invoices, can_approve_work,
            can_view_time_entries, can_view_budgets, can_add_comments, can_upload_files
          ) VALUES ($1, $2, $3, $4, 'active', true, NOW(), NOW(), $5, $6, $7, $8, $9, $10, $11)
          RETURNING *
        `, [
          invitation.client_id,
          invitation.email,
          invitation.name,
          passwordHash,
          permissions.canViewProjects ?? true,
          permissions.canViewInvoices ?? true,
          permissions.canApproveWork ?? false,
          permissions.canViewTimeEntries ?? false,
          permissions.canViewBudgets ?? false,
          permissions.canAddComments ?? true,
          permissions.canUploadFiles ?? true
        ])
        user = result.rows[0]
      }

      // Mark invitation as accepted
      await client.query(`
        UPDATE client_invitations
        SET status = 'accepted', accepted_at = NOW(), accepted_by_user_id = $1
        WHERE id = $2
      `, [user.id, invitation.id])

      // Log activity
      await client.query(`
        INSERT INTO client_activity_log (client_user_id, client_id, action, details)
        VALUES ($1, $2, 'account_activated', $3)
      `, [user.id, invitation.client_id, JSON.stringify({ invitationId: invitation.id })])
    })

    return {
      success: true,
      message: 'Account activated successfully',
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        clientName: invitation.client_name
      }
    }
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Failed to accept invitation:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to accept invitation'
    })
  }
})
