/**
 * Update Client Portal User
 * PUT /api/agency/client-portal/users/:id
 */

import { queryOne } from '~~/server/utils/db'
import { requireAuth, requireRole } from '~~/server/utils/auth'

interface UpdateClientUserBody {
  name?: string
  title?: string
  phone?: string
  avatarUrl?: string
  role?: 'admin' | 'manager' | 'viewer' | 'guest'
  isPrimaryContact?: boolean
  permissions?: {
    canViewProjects?: boolean
    canViewInvoices?: boolean
    canApproveWork?: boolean
    canViewTimeEntries?: boolean
    canViewBudgets?: boolean
    canAddComments?: boolean
    canUploadFiles?: boolean
    canInviteUsers?: boolean
    canViewAnalytics?: boolean
    canSubmitRequests?: boolean
    canViewCrm?: boolean
    canEditCrm?: boolean
    canAdminCrm?: boolean
  }
  status?: 'active' | 'suspended' | 'deactivated'
  emailNotifications?: boolean
  notificationPreferences?: Record<string, boolean>
  timezone?: string
}

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  await requireRole(event, ['owner', 'admin'])

  const userId = getRouterParam(event, 'id')
  const body = await readBody<UpdateClientUserBody>(event)

  if (!userId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'User ID is required'
    })
  }

  try {
    // Check user exists
    const existing = await queryOne(`
      SELECT id, status FROM client_users WHERE id = $1
    `, [userId])

    if (!existing) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Client user not found'
      })
    }

    // Build dynamic update
    const fields: string[] = []
    const values: any[] = []
    let idx = 1

    if (body.name !== undefined) {
      fields.push(`name = $${idx}`)
      values.push(body.name)
      idx++
    }

    if (body.title !== undefined) {
      fields.push(`title = $${idx}`)
      values.push(body.title)
      idx++
    }

    if (body.phone !== undefined) {
      fields.push(`phone = $${idx}`)
      values.push(body.phone)
      idx++
    }

    if (body.avatarUrl !== undefined) {
      fields.push(`avatar_url = $${idx}`)
      values.push(body.avatarUrl)
      idx++
    }

    if (body.role !== undefined) {
      fields.push(`role = $${idx}`)
      values.push(body.role)
      idx++
    }

    if (body.isPrimaryContact !== undefined) {
      fields.push(`is_primary_contact = $${idx}`)
      values.push(body.isPrimaryContact)
      idx++
    }

    if (body.status !== undefined) {
      fields.push(`status = $${idx}`)
      values.push(body.status)
      idx++
    }

    if (body.emailNotifications !== undefined) {
      fields.push(`email_notifications = $${idx}`)
      values.push(body.emailNotifications)
      idx++
    }

    if (body.notificationPreferences !== undefined) {
      fields.push(`notification_preferences = $${idx}`)
      values.push(JSON.stringify(body.notificationPreferences))
      idx++
    }

    if (body.timezone !== undefined) {
      fields.push(`timezone = $${idx}`)
      values.push(body.timezone)
      idx++
    }

    // Handle permissions
    if (body.permissions) {
      const p = body.permissions
      if (p.canViewProjects !== undefined) {
        fields.push(`can_view_projects = $${idx}`)
        values.push(p.canViewProjects)
        idx++
      }
      if (p.canViewInvoices !== undefined) {
        fields.push(`can_view_invoices = $${idx}`)
        values.push(p.canViewInvoices)
        idx++
      }
      if (p.canApproveWork !== undefined) {
        fields.push(`can_approve_work = $${idx}`)
        values.push(p.canApproveWork)
        idx++
      }
      if (p.canViewTimeEntries !== undefined) {
        fields.push(`can_view_time_entries = $${idx}`)
        values.push(p.canViewTimeEntries)
        idx++
      }
      if (p.canViewBudgets !== undefined) {
        fields.push(`can_view_budgets = $${idx}`)
        values.push(p.canViewBudgets)
        idx++
      }
      if (p.canAddComments !== undefined) {
        fields.push(`can_add_comments = $${idx}`)
        values.push(p.canAddComments)
        idx++
      }
      if (p.canUploadFiles !== undefined) {
        fields.push(`can_upload_files = $${idx}`)
        values.push(p.canUploadFiles)
        idx++
      }
      if (p.canInviteUsers !== undefined) {
        fields.push(`can_invite_users = $${idx}`)
        values.push(p.canInviteUsers)
        idx++
      }
      if (p.canViewAnalytics !== undefined) {
        fields.push(`can_view_analytics = $${idx}`)
        values.push(p.canViewAnalytics)
        idx++
      }
      if (p.canSubmitRequests !== undefined) {
        fields.push(`can_submit_requests = $${idx}`)
        values.push(p.canSubmitRequests)
        idx++
      }
      if (p.canViewCrm !== undefined) {
        fields.push(`can_view_crm = $${idx}`)
        values.push(p.canViewCrm)
        idx++
      }
      if (p.canEditCrm !== undefined) {
        fields.push(`can_edit_crm = $${idx}`)
        values.push(p.canEditCrm)
        idx++
      }
      if (p.canAdminCrm !== undefined) {
        fields.push(`can_admin_crm = $${idx}`)
        values.push(p.canAdminCrm)
        idx++
      }
    }

    if (fields.length === 0) {
      throw createError({
        statusCode: 400,
        statusMessage: 'No fields to update'
      })
    }

    values.push(userId)

    const user = await queryOne(`
      UPDATE client_users
      SET ${fields.join(', ')}, updated_at = NOW()
      WHERE id = $${idx}
      RETURNING *
    `, values)

    return {
      success: true,
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
          canSubmitRequests: user.can_submit_requests ?? true,
          canViewCrm: Boolean(user.can_view_crm),
          canEditCrm: Boolean(user.can_edit_crm),
          canAdminCrm: Boolean(user.can_admin_crm)
        },
        updatedAt: user.updated_at
      }
    }
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Failed to update client user:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to update client user'
    })
  }
})
