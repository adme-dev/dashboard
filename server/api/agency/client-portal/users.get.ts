/**
 * List Client Portal Users
 * GET /api/agency/client-portal/users
 *
 * Query params:
 * - clientId: Filter by client
 * - status: Filter by status
 * - limit: Max results
 */

import { queryRows, queryOne } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const query = getQuery(event)

  const clientId = query.clientId as string | undefined
  const status = query.status as string | undefined
  const limit = Math.min(Number(query.limit) || 50, 100)

  try {
    // Build query conditions
    const conditions: string[] = []
    const params: any[] = []
    let idx = 1

    if (clientId) {
      conditions.push(`cu.client_id = $${idx}`)
      params.push(clientId)
      idx++
    }

    if (status && status !== 'all') {
      conditions.push(`cu.status = $${idx}`)
      params.push(status)
      idx++
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
    params.push(limit)

    const users = await queryRows(`
      SELECT
        cu.id,
        cu.email,
        cu.name,
        cu.title,
        cu.phone,
        cu.is_primary_contact,
        cu.status,
        cu.can_view_projects,
        cu.can_view_invoices,
        cu.can_approve_work,
        cu.can_view_time_entries,
        cu.can_view_budgets,
        cu.last_login_at,
        cu.created_at,
        c.id as client_id,
        c.name as client_name,
        inviter.name as invited_by_name
      FROM client_users cu
      JOIN agency_clients c ON cu.client_id = c.id
      LEFT JOIN team_members inviter ON cu.invited_by = inviter.id
      ${whereClause}
      ORDER BY cu.created_at DESC
      LIMIT $${idx}
    `, params)

    // Get summary
    const summary = await queryOne(`
      SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN status = 'active' THEN 1 END) as active,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending,
        COUNT(CASE WHEN status = 'suspended' THEN 1 END) as suspended
      FROM client_users
      ${clientId ? 'WHERE client_id = $1' : ''}
    `, clientId ? [clientId] : [])

    return {
      users: users.map(u => ({
        id: u.id,
        email: u.email,
        name: u.name,
        title: u.title,
        phone: u.phone,
        isPrimaryContact: u.is_primary_contact,
        status: u.status,
        permissions: {
          canViewProjects: u.can_view_projects,
          canViewInvoices: u.can_view_invoices,
          canApproveWork: u.can_approve_work,
          canViewTimeEntries: u.can_view_time_entries,
          canViewBudgets: u.can_view_budgets
        },
        lastLoginAt: u.last_login_at,
        createdAt: u.created_at,
        clientId: u.client_id,
        clientName: u.client_name,
        invitedByName: u.invited_by_name
      })),
      summary: {
        total: Number(summary.total || 0),
        active: Number(summary.active || 0),
        pending: Number(summary.pending || 0),
        suspended: Number(summary.suspended || 0)
      }
    }
  } catch (error) {
    console.error('Failed to fetch client users:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch client users'
    })
  }
})
