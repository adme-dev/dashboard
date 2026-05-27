/**
 * Invite Client User to Portal
 * POST /api/agency/client-portal/invite
 *
 * Body:
 * - clientId: Client to invite user for
 * - email: User email
 * - name: User name
 * - permissions: Object with permission flags
 */

import { queryOne } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'
import { sendClientPortalInviteEmail } from '~~/server/utils/email'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const body = await readBody(event)

  const { clientId, email, name, permissions = {} } = body

  if (!clientId || !email || !name) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Client ID, email, and name are required'
    })
  }

  try {
    // Verify client exists
    const client = await queryOne(`
      SELECT id, name FROM agency_clients WHERE id = $1
    `, [clientId])

    if (!client) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Client not found'
      })
    }

    // Check if user already exists
    const existingUser = await queryOne(`
      SELECT id FROM client_users WHERE email = $1
    `, [email])

    if (existingUser) {
      throw createError({
        statusCode: 400,
        statusMessage: 'A user with this email already exists'
      })
    }

    // Generate invitation token
    const token = Buffer.from(crypto.getRandomValues(new Uint8Array(48))).toString('base64url')
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + 7) // 7 day expiry

    // Create invitation
    const invitation = await queryOne(`
      INSERT INTO client_invitations (
        client_id,
        email,
        name,
        token,
        permissions,
        invited_by,
        expires_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `, [
      clientId,
      email,
      name,
      token,
      JSON.stringify(permissions),
      user.id,
      expiresAt.toISOString()
    ])

    // Create client user in pending state
    const clientUser = await queryOne(`
      INSERT INTO client_users (
        client_id,
        email,
        name,
        status,
        invited_at,
        invited_by,
        can_view_projects,
        can_view_invoices,
        can_approve_work,
        can_view_time_entries,
        can_view_budgets,
        can_add_comments,
        can_upload_files,
        can_view_analytics,
        can_submit_requests
      ) VALUES ($1, $2, $3, 'pending', NOW(), $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *
    `, [
      clientId,
      email,
      name,
      user.id,
      permissions.canViewProjects ?? true,
      permissions.canViewInvoices ?? true,
      permissions.canApproveWork ?? false,
      permissions.canViewTimeEntries ?? false,
      permissions.canViewBudgets ?? false,
      permissions.canAddComments ?? true,
      permissions.canUploadFiles ?? true,
      permissions.canViewAnalytics ?? true,
      permissions.canSubmitRequests ?? true
    ])

    // Send invitation email
    try {
      await sendClientPortalInviteEmail({
        to: email,
        clientUserName: name,
        clientName: client.name,
        inviterName: user.name,
        token: token,
        expiresAt,
        permissions: {
          canViewProjects: permissions.canViewProjects ?? true,
          canViewInvoices: permissions.canViewInvoices ?? true,
          canApproveWork: permissions.canApproveWork ?? false,
          canViewTimeEntries: permissions.canViewTimeEntries ?? false,
          canViewBudgets: permissions.canViewBudgets ?? false,
          canAddComments: permissions.canAddComments ?? true,
          canUploadFiles: permissions.canUploadFiles ?? true,
          canViewAnalytics: permissions.canViewAnalytics ?? true,
          canSubmitRequests: permissions.canSubmitRequests ?? true
        }
      })
    } catch (emailError) {
      console.error('Failed to send invitation email:', emailError)
      // Don't fail the request if email fails - invitation is still created
    }

    return {
      invitation: {
        id: invitation.id,
        email: invitation.email,
        name: invitation.name,
        token: invitation.token, // In production, this would be sent via email only
        expiresAt: invitation.expires_at,
        inviteUrl: `/client-portal/accept-invite?token=${invitation.token}`
      },
      user: {
        id: clientUser.id,
        email: clientUser.email,
        name: clientUser.name,
        status: clientUser.status
      }
    }
  } catch (error: any) {
    console.error('Failed to create invitation:', error)
    if (error.statusCode) throw error
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to create invitation'
    })
  }
})
