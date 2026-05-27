/**
 * Client Portal - Organisation Users
 * GET /api/portal/users
 */

import { queryRows } from '~~/server/utils/db'
import { requireClientAuth } from '~~/server/utils/clientAuth'

type PortalUserRow = {
  id: string
  email: string
  name: string
  title: string | null
  role: string
  status: string
  avatar_url: string | null
  is_primary_contact: boolean
  can_view_projects: boolean
  can_view_invoices: boolean
  can_approve_work: boolean
  can_view_analytics: boolean
  can_submit_requests: boolean
  last_login_at: string | null
  invited_at: string | null
  created_at: string
}

export default defineEventHandler(async (event) => {
  const clientUser = await requireClientAuth(event)

  try {
    const users = await queryRows<PortalUserRow>(`
      SELECT
        id,
        email,
        name,
        title,
        role,
        status,
        avatar_url,
        is_primary_contact,
        can_view_projects,
        can_view_invoices,
        can_approve_work,
        can_view_analytics,
        can_submit_requests,
        last_login_at,
        invited_at,
        created_at
      FROM client_users
      WHERE client_id = $1
        AND email NOT LIKE '%@portal-access.local'
        AND COALESCE(title, '') <> 'Agency portal access'
      ORDER BY
        CASE WHEN id = $2 THEN 0 ELSE 1 END,
        CASE status WHEN 'active' THEN 0 WHEN 'pending' THEN 1 ELSE 2 END,
        is_primary_contact DESC,
        name ASC
    `, [clientUser.clientId, clientUser.id])

    const mappedUsers = users.map(user => ({
      id: user.id,
      email: user.email,
      name: user.name,
      title: user.title,
      role: user.role,
      status: user.status,
      avatarUrl: user.avatar_url,
      isPrimaryContact: user.is_primary_contact,
      permissions: {
        canViewProjects: user.can_view_projects,
        canViewInvoices: user.can_view_invoices,
        canApproveWork: user.can_approve_work,
        canViewAnalytics: user.can_view_analytics,
        canSubmitRequests: user.can_submit_requests
      },
      lastLoginAt: user.last_login_at,
      invitedAt: user.invited_at,
      createdAt: user.created_at,
      isCurrentUser: user.id === clientUser.id
    }))
    const activeUsers = mappedUsers.filter(user => user.status === 'active')
    const moduleCoverage = {
      projects: activeUsers.filter(user => user.permissions.canViewProjects).length,
      invoices: activeUsers.filter(user => user.permissions.canViewInvoices).length,
      approvals: activeUsers.filter(user => user.permissions.canApproveWork).length,
      analytics: activeUsers.filter(user => user.permissions.canViewAnalytics).length,
      requests: activeUsers.filter(user => user.permissions.canSubmitRequests).length
    }
    const lastLoginAt = mappedUsers
      .map(user => user.lastLoginAt)
      .filter((date): date is string => Boolean(date))
      .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] || null

    return {
      users: mappedUsers,
      summary: {
        total: mappedUsers.length,
        active: activeUsers.length,
        pending: mappedUsers.filter(user => user.status === 'pending').length,
        primaryContacts: mappedUsers.filter(user => user.isPrimaryContact).length,
        lastLoginAt,
        moduleCoverage
      }
    }
  } catch (error) {
    console.error('Failed to fetch portal users:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to fetch portal users' })
  }
})
