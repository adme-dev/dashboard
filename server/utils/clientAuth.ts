/**
 * Client Portal Authentication Utility
 * Cookie-based session auth for client-facing portal pages
 */

import { queryOne, queryRows } from '~~/server/utils/db'
import bcrypt from 'bcryptjs'
import type { H3Event } from 'h3'

export interface ServerClientUser {
  id: string
  email: string
  name: string
  title: string | null
  phone: string | null
  avatarUrl: string | null
  role: string
  isPrimaryContact: boolean
  clientId: string
  clientName: string
  clientLogo: string | null
  notificationPreferences: Record<string, boolean>
  timezone: string
  permissions: {
    canViewProjects: boolean
    canViewInvoices: boolean
    canApproveWork: boolean
    canViewTimeEntries: boolean
    canViewBudgets: boolean
    canAddComments: boolean
    canUploadFiles: boolean
    canInviteUsers: boolean
    canViewAnalytics: boolean
    canSubmitRequests: boolean
  }
}

export async function requireClientAuth(event: H3Event): Promise<ServerClientUser> {
  const sessionToken = getCookie(event, 'client_session_token')

  if (!sessionToken) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Not authenticated'
    })
  }

  // Get active sessions
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

  let matchedUserId: string | null = null

  for (const session of sessions) {
    try {
      const valid = await bcrypt.compare(sessionToken, session.token_hash)
      if (valid) {
        matchedUserId = session.client_user_id
        break
      }
    } catch {
      continue
    }
  }

  if (!matchedUserId) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Invalid or expired session'
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
      cu.can_view_analytics,
      cu.can_submit_requests,
      cu.notification_preferences,
      cu.timezone,
      cu.status,
      c.id as client_id,
      c.name as client_name,
      c.logo_url as client_logo
    FROM client_users cu
    JOIN agency_clients c ON cu.client_id = c.id
    WHERE cu.id = $1 AND cu.status = 'active'
  `, [matchedUserId])

  if (!user) {
    throw createError({
      statusCode: 401,
      statusMessage: 'User not found or inactive'
    })
  }

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    title: user.title,
    phone: user.phone,
    avatarUrl: user.avatar_url,
    role: user.role,
    isPrimaryContact: user.is_primary_contact,
    clientId: user.client_id,
    clientName: user.client_name,
    clientLogo: user.client_logo,
    notificationPreferences: user.notification_preferences || {},
    timezone: user.timezone || 'UTC',
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
    }
  }
}
