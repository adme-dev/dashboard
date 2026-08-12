/**
 * Accept a client portal invitation and create a client session.
 * POST /api/portal/auth/accept-invite
 */

import { transaction } from '~~/server/utils/db'
import {
  digestPortalSessionToken,
  generatePortalMagicLinkToken
} from '~~/server/utils/portalSession'
import { z } from 'zod'

const acceptSchema = z.object({
  token: z.string().min(32).max(100)
})

export default defineEventHandler(async (event) => {
  const parsed = acceptSchema.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invitation token is required'
    })
  }

  const rawToken = parsed.data.token
  const tokenDigest = await digestPortalSessionToken(rawToken)
  const sessionToken = generatePortalMagicLinkToken()
  const sessionDigest = await digestPortalSessionToken(sessionToken)
  const sessionExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
  const headers = getHeaders(event)
  const ipAddress = headers['x-forwarded-for']?.split(',')[0]?.trim()
    || headers['x-real-ip']
    || 'unknown'
  const userAgent = headers['user-agent'] || null

  await transaction(async (client) => {
    const invitationResult = await client.query(`
      SELECT
        invitation.id,
        invitation.client_id,
        invitation.email,
        invitation.name,
        invitation.permissions,
        invitation.status,
        invitation.expires_at,
        client.name AS client_name
      FROM client_invitations AS invitation
      JOIN agency_clients AS client ON client.id = invitation.client_id
      WHERE invitation.token IN ($1, $2)
      FOR UPDATE OF invitation
    `, [tokenDigest, rawToken])

    const invitation = invitationResult.rows[0]
    if (!invitation) {
      throw createError({ statusCode: 404, statusMessage: 'Invalid invitation token' })
    }
    if (invitation.status === 'accepted') {
      throw createError({ statusCode: 400, statusMessage: 'This invitation has already been accepted' })
    }
    if (invitation.status === 'cancelled') {
      throw createError({ statusCode: 400, statusMessage: 'This invitation has been cancelled' })
    }
    if (invitation.status === 'expired' || new Date(invitation.expires_at) < new Date()) {
      throw createError({ statusCode: 400, statusMessage: 'This invitation has expired' })
    }

    const existingUser = await client.query(`
      SELECT id
      FROM client_users
      WHERE LOWER(email) = LOWER($1) AND client_id = $2
      FOR UPDATE
    `, [invitation.email, invitation.client_id])

    let user
    if (existingUser.rows[0]) {
      const activated = await client.query(`
        UPDATE client_users
        SET
          status = 'active',
          email_verified = TRUE,
          email_verified_at = COALESCE(email_verified_at, NOW()),
          activated_at = COALESCE(activated_at, NOW()),
          updated_at = NOW()
        WHERE id = $1
        RETURNING id, email
      `, [existingUser.rows[0].id])
      user = activated.rows[0]
    } else {
      const permissions = invitation.permissions || {}
      const created = await client.query(`
        INSERT INTO client_users (
          client_id, email, name, status,
          email_verified, email_verified_at, activated_at,
          can_view_projects, can_view_invoices, can_approve_work,
          can_view_time_entries, can_view_budgets, can_add_comments, can_upload_files
        ) VALUES (
          $1, $2, $3, 'active', TRUE, NOW(), NOW(),
          $4, $5, $6, $7, $8, $9, $10
        )
        RETURNING id, email
      `, [
        invitation.client_id,
        invitation.email,
        invitation.name,
        permissions.canViewProjects ?? true,
        permissions.canViewInvoices ?? true,
        permissions.canApproveWork ?? false,
        permissions.canViewTimeEntries ?? false,
        permissions.canViewBudgets ?? false,
        permissions.canAddComments ?? true,
        permissions.canUploadFiles ?? true
      ])
      user = created.rows[0]
    }

    await client.query(`
      UPDATE client_invitations
      SET status = 'accepted', accepted_at = NOW(), accepted_by_user_id = $1
      WHERE id = $2
    `, [user.id, invitation.id])

    await client.query(`
      INSERT INTO client_sessions (
        client_user_id, token_hash, ip_address, user_agent, expires_at
      ) VALUES ($1, $2, $3, $4, $5)
    `, [
      user.id,
      sessionDigest,
      ipAddress === 'unknown' ? null : ipAddress,
      userAgent,
      sessionExpiresAt.toISOString()
    ])

    await client.query(`
      UPDATE client_users
      SET last_login_at = NOW(), login_count = login_count + 1
      WHERE id = $1
    `, [user.id])

    await client.query(`
      INSERT INTO client_activity_log (
        client_user_id, client_id, action, details, ip_address, user_agent
      ) VALUES ($1, $2, 'account_activated', $3, $4, $5)
    `, [
      user.id,
      invitation.client_id,
      JSON.stringify({ invitationId: invitation.id, authentication: 'email_link' }),
      ipAddress === 'unknown' ? null : ipAddress,
      userAgent
    ])
  })

  setCookie(event, 'client_session_token', sessionToken, {
    httpOnly: true,
    secure: getRequestURL(event).protocol === 'https:',
    sameSite: 'lax',
    maxAge: 30 * 24 * 60 * 60,
    path: '/'
  })

  return { success: true, redirect: '/portal' }
})
