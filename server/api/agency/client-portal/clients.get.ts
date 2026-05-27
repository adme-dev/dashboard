/**
 * List clients with client portal readiness and activity.
 * GET /api/agency/client-portal/clients
 */

import { PERMISSIONS } from '~~/server/utils/permissions'
import { requireRole } from '~~/server/utils/auth'
import { queryRows } from '~~/server/utils/db'

interface PortalClientRow {
  id: string
  name: string
  logo_url: string | null
  is_active: boolean
  created_at: string
  portal_users: string | number | null
  active_users: string | number | null
  pending_users: string | number | null
  agency_access_users: string | number | null
  last_login_at: string | null
  last_activity_at: string | null
  pending_approvals: string | number | null
  portal_leads_30d: string | number | null
  new_leads_30d: string | number | null
  won_leads_30d: string | number | null
  active_projects: string | number | null
}

export default defineEventHandler(async (event) => {
  await requireRole(event, [
    ...new Set([...PERMISSIONS.CLIENTS, ...PERMISSIONS.MEDIA_BUYING])
  ])

  const query = getQuery(event)
  const search = typeof query.search === 'string' ? query.search.trim() : ''
  const status = typeof query.status === 'string' ? query.status : 'all'
  const limit = Math.min(Number(query.limit) || 100, 250)

  const conditions = ['c.is_active = true']
  const params: Array<string | number> = []
  let idx = 1

  if (search) {
    conditions.push(`c.name ILIKE $${idx}`)
    params.push(`%${search}%`)
    idx++
  }

  if (status === 'configured') {
    conditions.push('COALESCE(cu.portal_users, 0) > 0')
  } else if (status === 'no-users') {
    conditions.push('COALESCE(cu.portal_users, 0) = 0')
  } else if (status === 'pending') {
    conditions.push('COALESCE(cu.pending_users, 0) > 0')
  }

  params.push(limit)

  try {
    const rows = await queryRows<PortalClientRow>(`
      SELECT
        c.id,
        c.name,
        c.logo_url,
        c.is_active,
        c.created_at,
        COALESCE(cu.portal_users, 0) AS portal_users,
        COALESCE(cu.active_users, 0) AS active_users,
        COALESCE(cu.pending_users, 0) AS pending_users,
        COALESCE(cu.agency_access_users, 0) AS agency_access_users,
        cu.last_login_at,
        al.last_activity_at,
        COALESCE(ap.pending_approvals, 0) AS pending_approvals,
        COALESCE(ld.portal_leads_30d, 0) AS portal_leads_30d,
        COALESCE(ld.new_leads_30d, 0) AS new_leads_30d,
        COALESCE(ld.won_leads_30d, 0) AS won_leads_30d,
        COALESCE(pr.active_projects, 0) AS active_projects
      FROM agency_clients c
      LEFT JOIN (
        SELECT
          client_id,
          COUNT(*) AS portal_users,
          COUNT(*) FILTER (WHERE status = 'active') AS active_users,
          COUNT(*) FILTER (WHERE status = 'pending') AS pending_users,
          COUNT(*) FILTER (WHERE email LIKE '%@portal-access.local') AS agency_access_users,
          MAX(last_login_at) AS last_login_at
        FROM client_users
        GROUP BY client_id
      ) cu ON cu.client_id = c.id
      LEFT JOIN (
        SELECT client_id, MAX(created_at) AS last_activity_at
        FROM client_activity_log
        GROUP BY client_id
      ) al ON al.client_id = c.id
      LEFT JOIN (
        SELECT p.client_id, COUNT(*) AS pending_approvals
        FROM client_approvals ca
        JOIN projects p ON p.id = ca.project_id
        WHERE ca.status = 'pending'
        GROUP BY p.client_id
      ) ap ON ap.client_id = c.id
      LEFT JOIN (
        SELECT
          l.client_id,
          COUNT(*) FILTER (WHERE l.submitted_at >= NOW() - INTERVAL '30 days') AS portal_leads_30d,
          COUNT(*) FILTER (WHERE l.submitted_at >= NOW() - INTERVAL '30 days' AND l.status = 'new') AS new_leads_30d,
          COUNT(*) FILTER (WHERE l.submitted_at >= NOW() - INTERVAL '30 days' AND l.status = 'won') AS won_leads_30d
        FROM leads l
        JOIN lead_form_rules r ON r.id = l.rule_id
        JOIN lead_form_destinations d ON d.rule_id = r.id
        WHERE l.deleted_at IS NULL
          AND r.enabled = TRUE
          AND d.destination_type = 'portal'
        GROUP BY l.client_id
      ) ld ON ld.client_id = c.id
      LEFT JOIN (
        SELECT client_id, COUNT(*) AS active_projects
        FROM projects
        WHERE status = 'active'
        GROUP BY client_id
      ) pr ON pr.client_id = c.id
      WHERE ${conditions.join(' AND ')}
      ORDER BY c.name
      LIMIT $${idx}
    `, params)

    return {
      clients: rows.map(row => ({
        id: row.id,
        name: row.name,
        logoUrl: row.logo_url,
        isActive: row.is_active,
        createdAt: row.created_at,
        portalUsers: Number(row.portal_users || 0),
        activeUsers: Number(row.active_users || 0),
        pendingUsers: Number(row.pending_users || 0),
        agencyAccessUsers: Number(row.agency_access_users || 0),
        lastLoginAt: row.last_login_at,
        lastActivityAt: row.last_activity_at,
        pendingApprovals: Number(row.pending_approvals || 0),
        portalLeads30d: Number(row.portal_leads_30d || 0),
        newLeads30d: Number(row.new_leads_30d || 0),
        wonLeads30d: Number(row.won_leads_30d || 0),
        activeProjects: Number(row.active_projects || 0),
        portalStatus: Number(row.active_users || 0) > 0
          ? 'active'
          : Number(row.pending_users || 0) > 0
            ? 'pending'
            : 'not_configured'
      }))
    }
  } catch (error) {
    console.error('Failed to fetch portal clients:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch portal clients'
    })
  }
})
