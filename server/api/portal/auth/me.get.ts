/**
 * Get Current Portal User
 * GET /api/portal/auth/me
 */

import { queryOneFresh } from '~~/server/utils/db'
import { requireClientAuth } from '~~/server/utils/clientAuth'

export default defineEventHandler(async (event) => {
  const clientUser = await requireClientAuth(event)

  try {
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
        ) ELSE 0 END AS open_requests,
        COALESCE((
          SELECT json_agg(notification ORDER BY notification."createdAt" DESC)
          FROM (
            SELECT
              id,
              type,
              title,
              message,
              action_url AS "actionUrl",
              is_read AS "isRead",
              created_at AS "createdAt"
            FROM client_notifications
            WHERE client_user_id = $2
              AND is_archived = false
            ORDER BY created_at DESC
            LIMIT 5
          ) notification
        ), '[]'::json) AS recent_notifications
    `, [
      clientUser.clientId,
      clientUser.id,
      Boolean(clientUser.permissions.canApproveWork),
      Boolean(clientUser.permissions.canViewProjects),
      Boolean(clientUser.permissions.canSubmitRequests)
    ])

    const recentNotifications = Array.isArray(bootstrap?.recent_notifications)
      ? bootstrap.recent_notifications
      : []

    return {
      user: {
        id: clientUser.id,
        email: clientUser.email,
        name: clientUser.name,
        title: clientUser.title,
        phone: clientUser.phone,
        avatarUrl: clientUser.avatarUrl,
        role: clientUser.role,
        isPrimaryContact: clientUser.isPrimaryContact,
        agencyAccess: clientUser.agencyAccess,
        notificationPreferences: clientUser.notificationPreferences,
        timezone: clientUser.timezone,
        permissions: clientUser.permissions
      },
      client: {
        id: clientUser.clientId,
        name: clientUser.clientName,
        logo: clientUser.clientLogo,
        leadCaptureMode: clientUser.leadCaptureMode
      },
      stats: {
        pendingApprovals: Number(bootstrap?.pending_approvals || 0),
        unreadNotifications: Number(bootstrap?.unread_notifications || 0),
        activeProjects: Number(bootstrap?.active_projects || 0),
        openRequests: Number(bootstrap?.open_requests || 0)
      },
      recentNotifications
    }
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'statusCode' in error) throw error
    console.error('Failed to get current user:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to get user info'
    })
  }
})
