/**
 * List clients with client portal readiness and activity.
 * GET /api/agency/client-portal/clients
 */

import { PERMISSIONS } from '~~/server/utils/permissions'
import { requireRole } from '~~/server/utils/auth'
import { queryRows } from '~~/server/utils/db'
import { ensureOfficeRecordingsTables } from '~~/server/utils/officeRecordings'

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
  project_access_users: string | number | null
  invoice_access_users: string | number | null
  approval_access_users: string | number | null
  analytics_access_users: string | number | null
  request_access_users: string | number | null
  last_login_at: string | null
  last_activity_at: string | null
  pending_approvals: string | number | null
  portal_leads_30d: string | number | null
  new_leads_30d: string | number | null
  won_leads_30d: string | number | null
  active_projects: string | number | null
  upcoming_jobs: string | number | null
  history_jobs: string | number | null
  visible_meetings: string | number | null
  upcoming_meetings: string | number | null
  meeting_recordings: string | number | null
}

const toNumber = (value: string | number | null | undefined) => Number(value || 0)

const buildSetupGaps = (row: PortalClientRow) => {
  const gaps: string[] = []
  const activeUsers = toNumber(row.active_users)
  const pendingUsers = toNumber(row.pending_users)
  const activeProjects = toNumber(row.active_projects)
  const upcomingJobs = toNumber(row.upcoming_jobs)
  const invoiceUsers = toNumber(row.invoice_access_users)
  const analyticsUsers = toNumber(row.analytics_access_users)
  const requestUsers = toNumber(row.request_access_users)
  const portalLeads = toNumber(row.portal_leads_30d)
  const visibleMeetings = toNumber(row.visible_meetings)

  if (activeUsers === 0) {
    gaps.push(pendingUsers > 0 ? 'Activate pending client users' : 'Invite a client portal user')
  }
  if (activeProjects === 0 && upcomingJobs === 0) gaps.push('Add booked jobs or project history')
  if (invoiceUsers === 0) gaps.push('Enable billing visibility')
  if (analyticsUsers === 0) gaps.push('Enable campaign analytics visibility')
  if (requestUsers === 0) gaps.push('Enable request intake')
  if (portalLeads === 0) gaps.push('Route lead forms to the portal')
  if (visibleMeetings === 0) gaps.push('Share client meetings or recordings')

  return gaps
}

const readinessScore = (row: PortalClientRow) => {
  const checks = [
    toNumber(row.active_users) > 0,
    toNumber(row.active_projects) > 0 || toNumber(row.upcoming_jobs) > 0 || toNumber(row.history_jobs) > 0,
    toNumber(row.invoice_access_users) > 0,
    toNumber(row.analytics_access_users) > 0,
    toNumber(row.request_access_users) > 0,
    toNumber(row.visible_meetings) > 0,
    Boolean(row.last_activity_at)
  ]

  return Math.round((checks.filter(Boolean).length / checks.length) * 100)
}

export default defineEventHandler(async (event) => {
  await requireRole(event, [
    ...new Set([...PERMISSIONS.CLIENTS, ...PERMISSIONS.MEDIA_BUYING])
  ])
  await ensureOfficeRecordingsTables()

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
        COALESCE(cu.project_access_users, 0) AS project_access_users,
        COALESCE(cu.invoice_access_users, 0) AS invoice_access_users,
        COALESCE(cu.approval_access_users, 0) AS approval_access_users,
        COALESCE(cu.analytics_access_users, 0) AS analytics_access_users,
        COALESCE(cu.request_access_users, 0) AS request_access_users,
        cu.last_login_at,
        al.last_activity_at,
        COALESCE(ap.pending_approvals, 0) AS pending_approvals,
        COALESCE(ld.portal_leads_30d, 0) AS portal_leads_30d,
        COALESCE(ld.new_leads_30d, 0) AS new_leads_30d,
        COALESCE(ld.won_leads_30d, 0) AS won_leads_30d,
        COALESCE(pr.active_projects, 0) AS active_projects,
        COALESCE(pr.upcoming_jobs, 0) AS upcoming_jobs,
        COALESCE(pr.history_jobs, 0) AS history_jobs,
        COALESCE(mt.visible_meetings, 0) AS visible_meetings,
        COALESCE(mt.upcoming_meetings, 0) AS upcoming_meetings,
        COALESCE(mt.meeting_recordings, 0) AS meeting_recordings
      FROM agency_clients c
      LEFT JOIN (
        SELECT
          client_id,
          COUNT(*) AS portal_users,
          COUNT(*) FILTER (WHERE status = 'active') AS active_users,
          COUNT(*) FILTER (WHERE status = 'pending') AS pending_users,
          COUNT(*) FILTER (WHERE email LIKE '%@portal-access.local') AS agency_access_users,
          COUNT(*) FILTER (WHERE status = 'active' AND can_view_projects = true) AS project_access_users,
          COUNT(*) FILTER (WHERE status = 'active' AND can_view_invoices = true) AS invoice_access_users,
          COUNT(*) FILTER (WHERE status = 'active' AND can_approve_work = true) AS approval_access_users,
          COUNT(*) FILTER (WHERE status = 'active' AND COALESCE(can_view_analytics, true) = true) AS analytics_access_users,
          COUNT(*) FILTER (WHERE status = 'active' AND COALESCE(can_submit_requests, true) = true) AS request_access_users,
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
        SELECT
          client_id,
          COUNT(*) FILTER (WHERE status = 'active') AS active_projects,
          COUNT(*) FILTER (
            WHERE status IN ('draft', 'active', 'on_hold')
              AND (due_date IS NULL OR due_date >= CURRENT_DATE)
          ) AS upcoming_jobs,
          COUNT(*) FILTER (WHERE status IN ('completed', 'cancelled')) AS history_jobs
        FROM projects
        GROUP BY client_id
      ) pr ON pr.client_id = c.id
      LEFT JOIN (
        SELECT
          cu.client_id,
          COUNT(DISTINCT oms.id) FILTER (WHERE oms.status <> 'cancelled') AS visible_meetings,
          COUNT(DISTINCT oms.id) FILTER (WHERE oms.status IN ('live', 'planned')) AS upcoming_meetings,
          COUNT(DISTINCT rec.id) FILTER (WHERE rec.status = 'ready') AS meeting_recordings
        FROM client_users cu
        JOIN office_members om ON om.client_user_id = cu.id
        JOIN office_meeting_sessions oms ON oms.office_id = om.office_id
        LEFT JOIN office_recordings rec ON rec.meeting_session_id = oms.id
          AND rec.status <> 'archived'
        GROUP BY cu.client_id
      ) mt ON mt.client_id = c.id
      WHERE ${conditions.join(' AND ')}
      ORDER BY c.name
      LIMIT $${idx}
    `, params)

    return {
      clients: rows.map((row) => {
        const activeUsers = toNumber(row.active_users)
        const pendingUsers = toNumber(row.pending_users)

        return {
          id: row.id,
          name: row.name,
          logoUrl: row.logo_url,
          isActive: row.is_active,
          createdAt: row.created_at,
          portalUsers: toNumber(row.portal_users),
          activeUsers,
          pendingUsers,
          agencyAccessUsers: toNumber(row.agency_access_users),
          moduleAccess: {
            projects: toNumber(row.project_access_users),
            invoices: toNumber(row.invoice_access_users),
            approvals: toNumber(row.approval_access_users),
            analytics: toNumber(row.analytics_access_users),
            requests: toNumber(row.request_access_users)
          },
          readinessScore: readinessScore(row),
          setupGaps: buildSetupGaps(row),
          lastLoginAt: row.last_login_at,
          lastActivityAt: row.last_activity_at,
          pendingApprovals: toNumber(row.pending_approvals),
          portalLeads30d: toNumber(row.portal_leads_30d),
          newLeads30d: toNumber(row.new_leads_30d),
          wonLeads30d: toNumber(row.won_leads_30d),
          activeProjects: toNumber(row.active_projects),
          upcomingJobs: toNumber(row.upcoming_jobs),
          historyJobs: toNumber(row.history_jobs),
          visibleMeetings: toNumber(row.visible_meetings),
          upcomingMeetings: toNumber(row.upcoming_meetings),
          meetingRecordings: toNumber(row.meeting_recordings),
          portalStatus: activeUsers > 0
            ? 'active'
            : pendingUsers > 0
              ? 'pending'
              : 'not_configured'
        }
      })
    }
  } catch (error) {
    console.error('Failed to fetch portal clients:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch portal clients'
    })
  }
})
