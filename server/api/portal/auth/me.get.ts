/**
 * Get Current Portal User
 * GET /api/portal/auth/me
 */

import { queryOne } from '~~/server/utils/db'
import { requireClientAuth } from '~~/server/utils/clientAuth'

export default defineEventHandler(async (event) => {
  const clientUser = await requireClientAuth(event)

  try {
    const pendingApprovals = await queryOne(`
      SELECT COUNT(*) as count
      FROM client_approvals ca
      JOIN projects p ON ca.project_id = p.id
      WHERE p.client_id = $1 AND ca.status = 'pending'
    `, [clientUser.clientId])

    const unreadNotifications = await queryOne(`
      SELECT COUNT(*) as count
      FROM client_notifications
      WHERE client_user_id = $1 AND is_read = false
    `, [clientUser.id])

    const activeProjects = await queryOne(`
      SELECT COUNT(*) as count
      FROM projects
      WHERE client_id = $1 AND status = 'active'
    `, [clientUser.clientId])

    const openRequests = await queryOne(`
      SELECT COUNT(*) as count
      FROM client_requests
      WHERE client_id = $1 AND status NOT IN ('completed', 'closed', 'cancelled')
    `, [clientUser.clientId])

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
        pendingApprovals: Number(pendingApprovals?.count || 0),
        unreadNotifications: Number(unreadNotifications?.count || 0),
        activeProjects: Number(activeProjects?.count || 0),
        openRequests: Number(openRequests?.count || 0)
      }
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
