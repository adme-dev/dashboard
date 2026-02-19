/**
 * Get Single Client Portal User
 * GET /api/agency/client-portal/users/:id
 */

import { queryOne } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  await requireAuth(event)

  const userId = getRouterParam(event, 'id')

  if (!userId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'User ID is required'
    })
  }

  try {
    const user = await queryOne(`
      SELECT
        cu.id,
        cu.email,
        cu.name,
        cu.title,
        cu.phone,
        cu.avatar_url,
        cu.is_primary_contact,
        cu.email_verified,
        cu.email_verified_at,
        cu.role,
        cu.can_view_projects,
        cu.can_view_invoices,
        cu.can_approve_work,
        cu.can_view_time_entries,
        cu.can_view_budgets,
        cu.can_add_comments,
        cu.can_upload_files,
        cu.can_invite_users,
        cu.status,
        cu.invited_at,
        cu.activated_at,
        cu.last_login_at,
        cu.login_count,
        cu.sso_provider,
        cu.email_notifications,
        cu.notification_preferences,
        cu.timezone,
        cu.created_at,
        cu.updated_at,
        c.id as client_id,
        c.name as client_name,
        inviter.id as invited_by_id,
        inviter.name as invited_by_name
      FROM client_users cu
      JOIN agency_clients c ON cu.client_id = c.id
      LEFT JOIN team_members inviter ON cu.invited_by = inviter.id
      WHERE cu.id = $1
    `, [userId])

    if (!user) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Client user not found'
      })
    }

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        title: user.title,
        phone: user.phone,
        avatarUrl: user.avatar_url,
        isPrimaryContact: user.is_primary_contact,
        emailVerified: user.email_verified,
        emailVerifiedAt: user.email_verified_at,
        role: user.role,
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
        status: user.status,
        invitedAt: user.invited_at,
        activatedAt: user.activated_at,
        lastLoginAt: user.last_login_at,
        loginCount: user.login_count,
        ssoProvider: user.sso_provider,
        emailNotifications: user.email_notifications,
        notificationPreferences: user.notification_preferences,
        timezone: user.timezone,
        createdAt: user.created_at,
        updatedAt: user.updated_at,
        clientId: user.client_id,
        clientName: user.client_name,
        invitedBy: user.invited_by_id ? {
          id: user.invited_by_id,
          name: user.invited_by_name
        } : null
      }
    }
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Failed to fetch client user:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch client user'
    })
  }
})
