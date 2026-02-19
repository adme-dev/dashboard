/**
 * Get Current Client Portal User
 * GET /api/agency/client-portal/auth/me
 *
 * Headers:
 * - Authorization: Bearer <sessionToken>
 *
 * Returns current authenticated client user info
 */

import { queryOne, queryRows } from '~~/server/utils/db'
import bcrypt from 'bcryptjs'

async function getClientUserFromSession(event: any) {
  const headers = getHeaders(event)
  const authHeader = headers.authorization

  if (!authHeader?.startsWith('Bearer ')) {
    return null
  }

  const sessionToken = authHeader.slice(7)

  // Get all active sessions and check the token
  // In production, use a more efficient token lookup
  const sessions = await queryRows(`
    SELECT
      cs.id,
      cs.token_hash,
      cs.client_user_id,
      cs.expires_at
    FROM client_sessions cs
    WHERE cs.expires_at > NOW()
    ORDER BY cs.created_at DESC
    LIMIT 100
  `)

  for (const session of sessions) {
    try {
      const valid = await bcrypt.compare(sessionToken, session.token_hash)
      if (valid) {
        return session.client_user_id
      }
    } catch {
      continue
    }
  }

  return null
}

export default defineEventHandler(async (event) => {
  try {
    const userId = await getClientUserFromSession(event)

    if (!userId) {
      throw createError({
        statusCode: 401,
        statusMessage: 'Not authenticated'
      })
    }

    const user = await queryOne(`
      SELECT
        cu.id,
        cu.email,
        cu.name,
        cu.title,
        cu.phone,
        cu.avatar_url,
        cu.role,
        cu.is_primary_contact,
        cu.can_view_projects,
        cu.can_view_invoices,
        cu.can_approve_work,
        cu.can_view_time_entries,
        cu.can_view_budgets,
        cu.can_add_comments,
        cu.can_upload_files,
        cu.can_invite_users,
        cu.status,
        cu.last_login_at,
        cu.notification_preferences,
        cu.timezone,
        c.id as client_id,
        c.name as client_name,
        c.logo_url as client_logo
      FROM client_users cu
      JOIN agency_clients c ON cu.client_id = c.id
      WHERE cu.id = $1 AND cu.status = 'active'
    `, [userId])

    if (!user) {
      throw createError({
        statusCode: 401,
        statusMessage: 'User not found or inactive'
      })
    }

    // Get pending approvals
    const pendingApprovals = await queryOne(`
      SELECT COUNT(*) as count
      FROM client_approvals ca
      JOIN projects p ON ca.project_id = p.id
      WHERE p.client_id = $1 AND ca.status = 'pending'
    `, [user.client_id])

    // Get unread notifications
    const unreadNotifications = await queryOne(`
      SELECT COUNT(*) as count
      FROM client_notifications
      WHERE client_user_id = $1 AND is_read = false
    `, [user.id])

    // Get active projects count
    const activeProjects = await queryOne(`
      SELECT COUNT(*) as count
      FROM projects
      WHERE client_id = $1 AND status = 'active'
    `, [user.client_id])

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        title: user.title,
        phone: user.phone,
        avatarUrl: user.avatar_url,
        role: user.role,
        isPrimaryContact: user.is_primary_contact,
        status: user.status,
        lastLoginAt: user.last_login_at,
        notificationPreferences: user.notification_preferences,
        timezone: user.timezone,
        permissions: {
          canViewProjects: user.can_view_projects,
          canViewInvoices: user.can_view_invoices,
          canApproveWork: user.can_approve_work,
          canViewTimeEntries: user.can_view_time_entries,
          canViewBudgets: user.can_view_budgets,
          canAddComments: user.can_add_comments,
          canUploadFiles: user.can_upload_files,
          canInviteUsers: user.can_invite_users
        }
      },
      client: {
        id: user.client_id,
        name: user.client_name,
        logo: user.client_logo
      },
      stats: {
        pendingApprovals: Number(pendingApprovals?.count || 0),
        unreadNotifications: Number(unreadNotifications?.count || 0),
        activeProjects: Number(activeProjects?.count || 0)
      }
    }
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Failed to get current user:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to get user info'
    })
  }
})
