/**
 * Get Current Client Portal User
 * GET /api/agency/client-portal/auth/me
 *
 * Headers:
 * - Authorization: Bearer <sessionToken>
 *
 * Returns current authenticated client user info
 */

import { queryOne, queryOneFresh } from '~~/server/utils/db'
import { digestPortalSessionToken } from '~~/server/utils/portalSession'

async function getClientUserFromSession(event: any) {
  const authHeader = getHeaders(event).authorization
  const cookieToken = getCookie(event, 'client_session_token')
  const sessionToken = cookieToken || (authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null)

  if (!sessionToken) {
    return null
  }

  const sessionDigest = await digestPortalSessionToken(sessionToken)
  const session = await queryOneFresh(`
    SELECT cs.client_user_id
    FROM client_sessions cs
    WHERE cs.token_hash = $1
      AND cs.expires_at > NOW()
    LIMIT 1
  `, [sessionDigest])

  return session?.client_user_id || null
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
        cu.can_nominate_competitors,
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
          canInviteUsers: user.can_invite_users,
          canNominateCompetitors: user.can_nominate_competitors ?? false
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
