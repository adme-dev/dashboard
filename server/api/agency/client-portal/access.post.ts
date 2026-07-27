/**
 * Start an agency-managed client portal session.
 * POST /api/agency/client-portal/access
 */

import { PERMISSIONS } from '~~/server/utils/permissions'
import { requireRole } from '~~/server/utils/auth'
import { queryOne, transaction } from '~~/server/utils/db'
import { digestPortalSessionToken } from '~~/server/utils/portalSession'

interface AccessClientPortalBody {
  clientId?: string
}

interface ClientRow {
  id: string
  name: string
  logo_url: string | null
}

interface ClientUserRow {
  id: string
  email: string
  name: string
  status: string
}

export default defineEventHandler(async (event) => {
  const agencyUser = await requireRole(event, [
    ...new Set([...PERMISSIONS.CLIENTS, ...PERMISSIONS.MEDIA_BUYING])
  ])
  const body = await readBody<AccessClientPortalBody>(event)
  const clientId = body.clientId

  if (!clientId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Client ID is required'
    })
  }

  try {
    const client = await queryOne<ClientRow>(`
      SELECT id, name, logo_url
      FROM agency_clients
      WHERE id = $1
    `, [clientId])

    if (!client) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Client not found'
      })
    }

    const accessEmail = `agency-${agencyUser.id}-${client.id}@portal-access.local`.toLowerCase()
    const displayName = `${agencyUser.name || agencyUser.email} (Agency)`
    const sessionToken = Buffer.from(crypto.getRandomValues(new Uint8Array(48))).toString('base64url')
    const tokenHash = await digestPortalSessionToken(sessionToken)
    const expiresAt = new Date()
    expiresAt.setHours(expiresAt.getHours() + 8)

    const headers = getHeaders(event)
    const ipAddress = headers['x-forwarded-for']?.split(',')[0] || headers['x-real-ip'] || null
    const userAgent = headers['user-agent'] || null

    const clientUser = await transaction<ClientUserRow>(async (db) => {
      const upsertResult = await db.query<ClientUserRow>(`
        INSERT INTO client_users (
          client_id,
          email,
          name,
          title,
          role,
          status,
          email_verified,
          email_verified_at,
          invited_by,
          activated_at,
          can_view_projects,
          can_view_invoices,
          can_approve_work,
          can_view_time_entries,
          can_view_budgets,
          can_add_comments,
          can_upload_files,
          can_invite_users,
          can_view_analytics,
          can_submit_requests
        ) VALUES (
          $1, $2, $3, 'Agency portal access', 'viewer', 'active', true, NOW(), $4, NOW(),
          true, true, false, true, true, false, false, false, true, false
        )
        ON CONFLICT (client_id, email) DO UPDATE SET
          name = EXCLUDED.name,
          title = EXCLUDED.title,
          status = 'active',
          email_verified = true,
          email_verified_at = COALESCE(client_users.email_verified_at, NOW()),
          invited_by = EXCLUDED.invited_by,
          can_view_projects = true,
          can_view_invoices = true,
          can_approve_work = false,
          can_view_time_entries = true,
          can_view_budgets = true,
          can_add_comments = false,
          can_upload_files = false,
          can_invite_users = false,
          can_view_analytics = true,
          can_submit_requests = false,
          updated_at = NOW()
        RETURNING id, email, name, status
      `, [client.id, accessEmail, displayName, agencyUser.id])

      const user = upsertResult.rows[0]
      if (!user) {
        throw new Error('Failed to create agency portal user')
      }

      await db.query(`
        INSERT INTO client_sessions (client_user_id, token_hash, ip_address, user_agent, expires_at)
        VALUES ($1, $2, $3, $4, $5)
      `, [user.id, tokenHash, ipAddress, userAgent, expiresAt.toISOString()])

      await db.query(`
        UPDATE client_users
        SET last_login_at = NOW(), login_count = login_count + 1
        WHERE id = $1
      `, [user.id])

      await db.query(`
        INSERT INTO client_activity_log (
          client_user_id,
          client_id,
          action,
          entity_type,
          entity_id,
          details,
          ip_address,
          user_agent
        ) VALUES ($1, $2, 'agency_portal_access', 'client', $2, $3, $4, $5)
      `, [
        user.id,
        client.id,
        JSON.stringify({
          agencyUserId: agencyUser.id,
          agencyUserEmail: agencyUser.email,
          agencyUserRole: agencyUser.role
        }),
        ipAddress,
        userAgent
      ])

      return user
    })

    setCookie(event, 'client_session_token', sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 8 * 60 * 60,
      path: '/'
    })

    return {
      ok: true,
      portalUrl: '/portal',
      client: {
        id: client.id,
        name: client.name,
        logoUrl: client.logo_url
      },
      user: {
        id: clientUser.id,
        email: clientUser.email,
        name: clientUser.name,
        status: clientUser.status,
        agencyAccess: true
      }
    }
  } catch (error: unknown) {
    if (typeof error === 'object' && error && 'statusCode' in error) throw error
    console.error('Failed to start agency portal access:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to open client portal'
    })
  }
})
