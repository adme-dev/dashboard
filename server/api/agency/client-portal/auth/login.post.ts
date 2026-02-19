/**
 * Client Portal Login
 * POST /api/agency/client-portal/auth/login
 *
 * Body:
 * - email: User email
 * - password: User password
 */

import { queryOne, queryRows, transaction } from '~~/server/utils/db'
import bcrypt from 'bcryptjs'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const { email, password } = body

  if (!email || !password) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Email and password are required'
    })
  }

  try {
    // Find user
    const user = await queryOne(`
      SELECT
        cu.id,
        cu.email,
        cu.name,
        cu.password_hash,
        cu.status,
        cu.role,
        cu.avatar_url,
        cu.can_view_projects,
        cu.can_view_invoices,
        cu.can_approve_work,
        cu.can_view_time_entries,
        cu.can_view_budgets,
        cu.can_add_comments,
        cu.can_upload_files,
        cu.can_invite_users,
        cu.notification_preferences,
        cu.timezone,
        c.id as client_id,
        c.name as client_name
      FROM client_users cu
      JOIN agency_clients c ON cu.client_id = c.id
      WHERE cu.email = $1
    `, [email.toLowerCase()])

    if (!user) {
      throw createError({
        statusCode: 401,
        statusMessage: 'Invalid email or password'
      })
    }

    if (!user.password_hash) {
      throw createError({
        statusCode: 401,
        statusMessage: 'Account not activated. Please use your invitation link.'
      })
    }

    if (user.status !== 'active') {
      throw createError({
        statusCode: 403,
        statusMessage: `Account is ${user.status}. Please contact support.`
      })
    }

    // Verify password
    const valid = await bcrypt.compare(password, user.password_hash)
    if (!valid) {
      throw createError({
        statusCode: 401,
        statusMessage: 'Invalid email or password'
      })
    }

    // Create session
    const sessionToken = Buffer.from(crypto.getRandomValues(new Uint8Array(48))).toString('base64url')
    const tokenHash = await bcrypt.hash(sessionToken, 10)
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + 30) // 30 day session

    // Get client IP and user agent
    const headers = getHeaders(event)
    const ipAddress = headers['x-forwarded-for']?.split(',')[0] || headers['x-real-ip'] || null
    const userAgent = headers['user-agent'] || null

    await transaction(async (client) => {
      // Create session
      await client.query(`
        INSERT INTO client_sessions (client_user_id, token_hash, ip_address, user_agent, expires_at)
        VALUES ($1, $2, $3, $4, $5)
      `, [user.id, tokenHash, ipAddress, userAgent, expiresAt.toISOString()])

      // Update login stats
      await client.query(`
        UPDATE client_users
        SET last_login_at = NOW(), login_count = login_count + 1
        WHERE id = $1
      `, [user.id])

      // Log activity
      await client.query(`
        INSERT INTO client_activity_log (client_user_id, client_id, action, ip_address, user_agent)
        VALUES ($1, $2, 'login', $3, $4)
      `, [user.id, user.client_id, ipAddress, userAgent])
    })

    // Get pending approvals count
    const pendingApprovals = await queryOne(`
      SELECT COUNT(*) as count
      FROM client_approvals ca
      JOIN projects p ON ca.project_id = p.id
      WHERE p.client_id = $1 AND ca.status = 'pending'
    `, [user.client_id])

    // Get unread notifications count
    const unreadNotifications = await queryOne(`
      SELECT COUNT(*) as count
      FROM client_notifications
      WHERE client_user_id = $1 AND is_read = false
    `, [user.id])

    return {
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        avatarUrl: user.avatar_url,
        clientId: user.client_id,
        clientName: user.client_name,
        permissions: {
          canViewProjects: user.can_view_projects,
          canViewInvoices: user.can_view_invoices,
          canApproveWork: user.can_approve_work,
          canViewTimeEntries: user.can_view_time_entries,
          canViewBudgets: user.can_view_budgets,
          canAddComments: user.can_add_comments,
          canUploadFiles: user.can_upload_files,
          canInviteUsers: user.can_invite_users
        },
        notificationPreferences: user.notification_preferences,
        timezone: user.timezone
      },
      sessionToken, // In production, set as httpOnly cookie
      expiresAt: expiresAt.toISOString(),
      stats: {
        pendingApprovals: Number(pendingApprovals?.count || 0),
        unreadNotifications: Number(unreadNotifications?.count || 0)
      }
    }
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Login failed:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Login failed'
    })
  }
})
