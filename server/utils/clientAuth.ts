/**
 * Client Portal Authentication Utility
 * Cookie-based session auth for client-facing portal pages
 */

import { queryOneFresh } from '~~/server/utils/db'
import { digestPortalSessionToken } from '~~/server/utils/portalSession'
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
  agencyAccess: boolean
  canManageLeadOutcomes: boolean
  clientId: string
  clientName: string
  clientLogo: string | null
  leadCaptureMode: 'analytics_only' | 'capture_only' | 'lightweight_crm' | 'full_crm' | 'external_crm'
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
    canNominateCompetitors: boolean
    canSubmitRequests: boolean
    canViewCrm: boolean
    canEditCrm: boolean
    canAdminCrm: boolean
  }
}

export async function requireClientAuth(event: H3Event): Promise<ServerClientUser> {
  const cached = (event.context as { clientPortalUser?: ServerClientUser }).clientPortalUser
  if (cached) return cached

  const sessionToken = getCookie(event, 'client_session_token')

  if (!sessionToken) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Not authenticated'
    })
  }

  const sessionDigest = await digestPortalSessionToken(sessionToken)
  const user = await queryOneFresh(`
    SELECT
      cu.id,
      cu.email,
      cu.name,
      cu.title,
      cu.phone,
      cu.avatar_url,
      cu.role,
      cu.is_primary_contact,
      cu.can_manage_lead_outcomes,
      cu.can_view_projects,
      cu.can_view_invoices,
      cu.can_approve_work,
      cu.can_view_time_entries,
      cu.can_view_budgets,
      cu.can_add_comments,
      cu.can_upload_files,
      cu.can_invite_users,
      cu.can_view_analytics,
      cu.can_nominate_competitors,
      cu.can_submit_requests,
      cu.can_view_crm,
      cu.can_edit_crm,
      cu.can_admin_crm,
      cu.notification_preferences,
      cu.timezone,
      c.id as client_id,
      c.name as client_name,
      c.logo_url as client_logo,
      c.lead_capture_mode
    FROM client_sessions cs
    JOIN client_users cu ON cu.id = cs.client_user_id
    JOIN agency_clients c ON c.id = cu.client_id
    WHERE cs.token_hash = $1
      AND cs.expires_at > NOW()
      AND cu.status = 'active'
    LIMIT 1
  `, [sessionDigest])

  // Legacy bcrypt session hashes cannot be looked up without scanning and
  // comparing every active session. Reject them so forged cookies cannot turn
  // authentication into an unbounded CPU workload. Existing users sign in once
  // to receive an indexed digest session.
  if (!user) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Invalid or expired session'
    })
  }

  const authenticatedUser: ServerClientUser = {
    id: user.id,
    email: user.email,
    name: user.name,
    title: user.title,
    phone: user.phone,
    avatarUrl: user.avatar_url,
    role: user.role,
    isPrimaryContact: user.is_primary_contact,
    agencyAccess: user.email.toLowerCase().endsWith('@portal-access.local'),
    canManageLeadOutcomes: user.can_manage_lead_outcomes ?? false,
    clientId: user.client_id,
    clientName: user.client_name,
    clientLogo: user.client_logo,
    leadCaptureMode: user.lead_capture_mode || 'capture_only',
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
      canNominateCompetitors: user.can_nominate_competitors ?? false,
      canSubmitRequests: user.can_submit_requests ?? true,
      canViewCrm: Boolean(user.can_view_crm),
      canEditCrm: Boolean(user.can_edit_crm),
      canAdminCrm: Boolean(user.can_admin_crm)
    }
  }
  ;(event.context as { clientPortalUser?: ServerClientUser }).clientPortalUser = authenticatedUser
  return authenticatedUser
}
