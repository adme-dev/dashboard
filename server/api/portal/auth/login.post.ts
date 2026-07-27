/**
 * Client Portal Login (Cookie-based)
 * POST /api/portal/auth/login
 */

import { queryOneFresh, transaction } from '~~/server/utils/db'
import { checkAndConsume } from '~~/server/utils/rateLimit'
import { digestPortalSessionToken } from '~~/server/utils/portalSession'
import bcrypt from 'bcryptjs'
import { z } from 'zod'

const loginSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(1).max(256)
})

const DUMMY_PASSWORD_HASH = '$2b$10$YwwVw2nR6/13.oooNHUY8es3GrBoCAFSg8VpgyvWif3llDnQmZwUy'

async function enforceLoginLimit(
  event: Parameters<typeof getHeaders>[0],
  key: string,
  limit: number,
  windowSeconds: number
) {
  const result = await checkAndConsume({ key, limit, windowSeconds })
  if (result.allowed) return

  const retryAfter = Math.max(1, Math.ceil((result.resetAt.getTime() - Date.now()) / 1000))
  setHeader(event, 'Retry-After', retryAfter)
  throw createError({
    statusCode: 429,
    statusMessage: 'Too many sign-in attempts. Try again later.'
  })
}

export default defineEventHandler(async (event) => {
  const parsed = loginSchema.safeParse(await readBody(event))

  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid login request'
    })
  }

  const email = parsed.data.email.toLowerCase()
  const password = parsed.data.password
  const headers = getHeaders(event)
  const ipAddress = headers['x-forwarded-for']?.split(',')[0]?.trim()
    || headers['x-real-ip']
    || 'unknown'
  const emailKey = await digestPortalSessionToken(email)
  const ipKey = await digestPortalSessionToken(ipAddress)

  await enforceLoginLimit(event, `portal-login:email:${emailKey}`, 5, 15 * 60)
  await enforceLoginLimit(event, `portal-login:ip:${ipKey}`, 20, 15 * 60)

  try {
    const user = await queryOneFresh(`
      SELECT
        cu.id,
        cu.email,
        cu.name,
        cu.password_hash,
        cu.status,
        cu.role,
        cu.avatar_url,
        cu.is_primary_contact,
        cu.can_view_projects,
        cu.can_view_invoices,
        cu.can_approve_work,
        cu.can_view_time_entries,
        cu.can_view_budgets,
        cu.can_add_comments,
        cu.can_upload_files,
        cu.can_invite_users,
        cu.can_view_analytics,
        cu.can_submit_requests,
        cu.notification_preferences,
        cu.timezone,
        c.id as client_id,
        c.name as client_name,
        c.logo_url as client_logo,
        c.lead_capture_mode
      FROM client_users cu
      JOIN agency_clients c ON cu.client_id = c.id
      WHERE cu.email = $1
    `, [email])

    const valid = await bcrypt.compare(password, user?.password_hash || DUMMY_PASSWORD_HASH)
    if (!user || !valid || !user.password_hash || user.status !== 'active') {
      throw createError({
        statusCode: 401,
        statusMessage: 'Invalid email or password'
      })
    }

    // Create session
    const sessionToken = Buffer.from(crypto.getRandomValues(new Uint8Array(48))).toString('base64url')
    const tokenHash = await digestPortalSessionToken(sessionToken)
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + 30)

    const userAgent = headers['user-agent'] || null

    await transaction(async (client) => {
      await client.query(`
        INSERT INTO client_sessions (client_user_id, token_hash, ip_address, user_agent, expires_at)
        VALUES ($1, $2, $3, $4, $5)
      `, [user.id, tokenHash, ipAddress === 'unknown' ? null : ipAddress, userAgent, expiresAt.toISOString()])

      await client.query(`
        UPDATE client_users
        SET last_login_at = NOW(), login_count = login_count + 1
        WHERE id = $1
      `, [user.id])

      await client.query(`
        INSERT INTO client_activity_log (client_user_id, client_id, action, ip_address, user_agent)
        VALUES ($1, $2, 'login', $3, $4)
      `, [user.id, user.client_id, ipAddress === 'unknown' ? null : ipAddress, userAgent])
    })

    // Set httpOnly cookie
    setCookie(event, 'client_session_token', sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60,
      path: '/'
    })

    const bootstrap = await queryOneFresh(`
      SELECT
        CASE WHEN $3::boolean THEN (
          SELECT COUNT(*)
          FROM client_approvals ca
          JOIN projects p ON ca.project_id = p.id
          WHERE p.client_id = $1 AND ca.status = 'pending'
        ) ELSE 0 END AS pending_approvals,
        (
          SELECT COUNT(*)
          FROM client_notifications
          WHERE client_user_id = $2
            AND is_read = false
            AND is_archived = false
        ) AS unread_notifications,
        CASE WHEN $4::boolean THEN (
          SELECT COUNT(*)
          FROM projects
          WHERE client_id = $1 AND status = 'active'
        ) ELSE 0 END AS active_projects,
        CASE WHEN $5::boolean THEN (
          SELECT COUNT(*)
          FROM client_requests
          WHERE client_id = $1
            AND status NOT IN ('completed', 'closed', 'cancelled')
        ) ELSE 0 END AS open_requests
    `, [
      user.client_id,
      user.id,
      Boolean(user.can_approve_work),
      Boolean(user.can_view_projects),
      Boolean(user.can_submit_requests)
    ])

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        avatarUrl: user.avatar_url,
        isPrimaryContact: user.is_primary_contact,
        clientId: user.client_id,
        clientName: user.client_name,
        clientLogo: user.client_logo,
        leadCaptureMode: user.lead_capture_mode || 'capture_only',
        permissions: {
          canViewProjects: user.can_view_projects,
          canViewInvoices: user.can_view_invoices,
          canApproveWork: user.can_approve_work,
          canViewTimeEntries: user.can_view_time_entries,
          canViewBudgets: user.can_view_budgets,
          canAddComments: user.can_add_comments,
          canUploadFiles: user.can_upload_files,
          canInviteUsers: user.can_invite_users,
          canViewAnalytics: user.can_view_analytics ?? true,
          canSubmitRequests: user.can_submit_requests ?? true
        },
        notificationPreferences: user.notification_preferences,
        timezone: user.timezone
      },
      stats: {
        pendingApprovals: Number(bootstrap?.pending_approvals || 0),
        unreadNotifications: Number(bootstrap?.unread_notifications || 0),
        activeProjects: Number(bootstrap?.active_projects || 0),
        openRequests: Number(bootstrap?.open_requests || 0)
      }
    }
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'statusCode' in error) throw error
    console.error('Login failed:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Login failed'
    })
  }
})
