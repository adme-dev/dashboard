/**
 * Client Portal Dashboard
 * GET /api/portal/dashboard
 */

import { queryOne, queryRows } from '~~/server/utils/db'
import { requireClientAuth } from '~~/server/utils/clientAuth'
import { buildClientCondition, toNum } from '~~/server/utils/analyticsMetrics'

const PORTAL_VISIBLE_LEADS_EXISTS = `EXISTS (
  SELECT 1 FROM lead_form_rules r
  JOIN lead_rule_destinations d ON d.rule_id = r.id
  WHERE r.source = l.source AND r.form_id = l.form_id
    AND r.client_id = l.client_id
    AND r.enabled = TRUE
    AND d.destination_type = 'portal' AND d.enabled = TRUE
)`

export default defineEventHandler(async (event) => {
  const clientUser = await requireClientAuth(event)
  const clientId = clientUser.clientId
  const canViewProjects = clientUser.permissions.canViewProjects
  const canViewBudgets = clientUser.permissions.canViewBudgets
  const canViewInvoices = clientUser.permissions.canViewInvoices
  const canApproveWork = clientUser.permissions.canApproveWork
  const section = String(getQuery(event).section || 'core')
  const allowedSections = new Set(['core', 'operations', 'enterprise', 'analytics'])
  if (!allowedSections.has(section)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid dashboard section' })
  }
  const loadCore = section === 'core'
  const loadOperations = section === 'operations'
  const loadEnterprise = section === 'enterprise'
  const loadAnalytics = section === 'analytics'

  const safeQuery = async <T>(label: string, fallback: T, fn: () => Promise<T>): Promise<T> => {
    try {
      return await fn()
    } catch (error) {
      console.warn(`[portal-dashboard] ${label} failed`, error)
      return fallback
    }
  }

  try {
    const emptyClient = {
      id: null,
      name: null,
      logo_url: null,
      is_active: false,
      billing_type: null,
      retainer_amount: null,
      created_at: null
    }
    const client = loadCore
      ? await safeQuery('client', emptyClient, async () => queryOne(`
      SELECT id, name, logo_url, is_active, billing_type, retainer_amount, created_at
      FROM agency_clients
      WHERE id = $1
    `, [clientId]))
      : emptyClient

    const emptyProjectStats = {
      total: 0,
      active: 0,
      completed: 0,
      on_hold: 0
    }
    const projectStats = loadCore && canViewProjects
      ? await safeQuery('projectStats', emptyProjectStats, async () => queryOne(`
      SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN status = 'active' THEN 1 END) as active,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed,
        COUNT(CASE WHEN status = 'on_hold' THEN 1 END) as on_hold
      FROM projects
      WHERE client_id = $1
    `, [clientId]))
      : emptyProjectStats

    const activeProjects = loadCore && canViewProjects
      ? await safeQuery<any[]>('activeProjects', [], async () => queryRows(`
      SELECT
        p.id,
        p.name,
        p.status,
        p.start_date,
        p.due_date,
        p.budget,
        COALESCE(
          (SELECT COUNT(*) FROM tasks t
           JOIN task_statuses ts ON t.status_id = ts.id
           WHERE t.project_id = p.id AND t.status_is_final = true)::float /
          NULLIF((SELECT COUNT(*) FROM tasks WHERE project_id = p.id), 0) * 100,
          0
        ) as progress_percent,
        (SELECT COUNT(*) FROM tasks WHERE project_id = p.id) as total_tasks,
        (SELECT COUNT(*) FROM tasks t
         JOIN task_statuses ts ON t.status_id = ts.id
         WHERE t.project_id = p.id AND t.status_is_final = true) as completed_tasks
      FROM projects p
      WHERE p.client_id = $1 AND p.status = 'active'
      ORDER BY p.due_date ASC NULLS LAST
      LIMIT 10
    `, [clientId]))
      : []

    const upcomingJobs = loadCore && canViewProjects
      ? await safeQuery<any[]>('upcomingJobs', [], async () => queryRows(`
      SELECT
        p.id,
        p.name,
        p.status,
        p.start_date,
        p.due_date,
        p.budget,
        COALESCE(task_stats.total_tasks, 0) AS total_tasks,
        COALESCE(task_stats.completed_tasks, 0) AS completed_tasks
      FROM projects p
      LEFT JOIN LATERAL (
        SELECT
          COUNT(*) AS total_tasks,
          COUNT(*) FILTER (WHERE t.status_is_final = true) AS completed_tasks
        FROM tasks t
        WHERE t.project_id = p.id
      ) task_stats ON TRUE
      WHERE p.client_id = $1
        AND p.status IN ('draft', 'active', 'on_hold')
        AND (p.due_date IS NULL OR p.due_date >= CURRENT_DATE)
      ORDER BY
        p.due_date ASC NULLS LAST,
        p.start_date ASC NULLS LAST,
        p.created_at DESC
      LIMIT 6
    `, [clientId]))
      : []

    const completedJobs = loadCore && canViewProjects
      ? await safeQuery<any[]>('completedJobs', [], async () => queryRows(`
      SELECT
        p.id,
        p.name,
        p.status,
        p.start_date,
        p.due_date,
        p.budget,
        p.updated_at,
        COALESCE(task_stats.total_tasks, 0) AS total_tasks,
        COALESCE(task_stats.completed_tasks, 0) AS completed_tasks
      FROM projects p
      LEFT JOIN LATERAL (
        SELECT
          COUNT(*) AS total_tasks,
          COUNT(*) FILTER (WHERE t.status_is_final = true) AS completed_tasks
        FROM tasks t
        WHERE t.project_id = p.id
      ) task_stats ON TRUE
      WHERE p.client_id = $1
        AND p.status IN ('completed', 'cancelled')
      ORDER BY
        p.due_date DESC NULLS LAST,
        p.updated_at DESC,
        p.created_at DESC
      LIMIT 6
    `, [clientId]))
      : []

    const pendingApprovals = loadCore && canApproveWork
      ? await safeQuery<any[]>('pendingApprovals', [], async () => queryRows(`
      SELECT
        ca.id,
        ca.approval_type,
        ca.title,
        ca.due_date,
        ca.requested_at,
        p.name as project_name,
        tm.name as requested_by_name
      FROM client_approvals ca
      JOIN projects p ON ca.project_id = p.id
      LEFT JOIN team_members tm ON ca.requested_by = tm.id
      WHERE p.client_id = $1 AND ca.status = 'pending'
      ORDER BY ca.due_date ASC NULLS LAST, ca.requested_at DESC
      LIMIT 5
    `, [clientId]))
      : []

    const recentDeliverables = loadOperations
      ? await safeQuery<any[]>('recentDeliverables', [], async () => queryRows(`
      SELECT
        cd.id,
        cd.title,
        cd.deliverable_type,
        cd.thumbnail_url,
        cd.status,
        cd.published_at,
        p.name as project_name
      FROM client_deliverables cd
      LEFT JOIN projects p ON cd.project_id = p.id
      WHERE cd.client_id = $1 AND cd.is_visible_to_client = true
      ORDER BY cd.published_at DESC NULLS LAST, cd.created_at DESC
      LIMIT 8
    `, [clientId]))
      : []

    const emptyInvoiceStats = {
      total: 0,
      paid: 0,
      outstanding: 0,
      total_paid: 0,
      total_outstanding: 0
    }
    const invoiceStats = loadOperations && canViewInvoices
      ? await safeQuery('invoiceStats', emptyInvoiceStats, async () => queryOne(`
      SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN status = 'paid' THEN 1 END) as paid,
        COUNT(CASE WHEN status IN ('sent', 'overdue') THEN 1 END) as outstanding,
        COALESCE(SUM(CASE WHEN status = 'paid' THEN total_amount ELSE 0 END), 0) as total_paid,
        COALESCE(SUM(CASE WHEN status IN ('sent', 'overdue') THEN total_amount - amount_paid ELSE 0 END), 0) as total_outstanding
      FROM invoices
      WHERE client_id = $1
    `, [clientId]))
      : emptyInvoiceStats

    const outstandingInvoices = loadOperations && canViewInvoices
      ? await safeQuery<any[]>('outstandingInvoices', [], async () => queryRows(`
      SELECT id, invoice_number, total_amount, amount_paid, due_date, status
      FROM invoices
      WHERE client_id = $1 AND status IN ('sent', 'overdue')
      ORDER BY due_date ASC
      LIMIT 5
    `, [clientId]))
      : []

    const recentActivity = loadOperations
      ? await safeQuery<any[]>('recentActivity', [], async () => queryRows(`
      SELECT
        cal.id,
        cal.action,
        cal.entity_type,
        cal.entity_id,
        cal.details,
        cal.created_at,
        cu.name as user_name
      FROM client_activity_log cal
      LEFT JOIN client_users cu ON cal.client_user_id = cu.id
      WHERE cal.client_id = $1
      ORDER BY cal.created_at DESC
      LIMIT 10
    `, [clientId]))
      : []

    // Open client requests
    const emptyRequestStats = {
      total: 0,
      submitted: 0,
      needs_review: 0,
      in_progress: 0,
      open: 0,
      resolved: 0
    }
    const requestStats = loadCore
      ? await safeQuery('requestStats', emptyRequestStats, async () => queryOne(`
      SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN status = 'submitted' THEN 1 END) as submitted,
        COUNT(CASE WHEN status IN ('submitted', 'in_review') THEN 1 END) as needs_review,
        COUNT(CASE WHEN status IN ('in_review', 'approved', 'in_progress') THEN 1 END) as in_progress,
        COUNT(CASE WHEN status NOT IN ('completed', 'closed', 'cancelled') THEN 1 END) as open,
        COUNT(CASE WHEN status IN ('completed', 'closed') THEN 1 END) as resolved
      FROM client_requests
      WHERE client_id = $1
    `, [clientId]))
      : emptyRequestStats

    const recentRequests = loadCore
      ? await safeQuery<any[]>('recentRequests', [], async () => queryRows(`
      SELECT
        cr.id,
        cr.request_type,
        cr.title,
        cr.priority,
        cr.status,
        cr.created_at,
        tm.name as assigned_name
      FROM client_requests cr
      LEFT JOIN team_members tm ON cr.assigned_to = tm.id
      WHERE cr.client_id = $1 AND cr.status NOT IN ('completed', 'closed', 'cancelled')
      ORDER BY
        CASE cr.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END,
        cr.created_at DESC
      LIMIT 5
    `, [clientId]))
      : []

    // Team members (project managers on active projects)
    const teamMembers = loadOperations && canViewProjects
      ? await safeQuery<any[]>('teamMembers', [], async () => queryRows(`
      SELECT DISTINCT ON (tm.id)
        tm.id,
        tm.name,
        tm.email,
        NULL::text AS phone,
        tm.avatar_url,
        tm.role,
        d.name AS department
      FROM team_members tm
      JOIN projects p ON p.project_manager_id = tm.id
      LEFT JOIN departments d ON d.id = tm.department_id
      WHERE p.client_id = $1 AND p.status = 'active'
      ORDER BY tm.id
      LIMIT 5
    `, [clientId]))
      : []

    const meetings = loadOperations ? await safeQuery<any[]>('meetings', [], async () => {
      return queryRows(`
        SELECT
          oms.id,
          oms.office_id,
          o.name AS office_name,
          oms.title,
          oms.status,
          oms.source,
          oms.started_at,
          oms.ended_at,
          oms.created_at,
          oms.consent #>> '{setup,scheduled_start_at}' AS scheduled_start_at,
          oms.consent #>> '{setup,duration_minutes}' AS duration_minutes,
          oz.name AS zone_name,
          oz.slug AS zone_slug,
          COALESCE(recording_summary.ready_recording_count, 0)::int AS ready_recording_count,
          recording_summary.latest_recording_token
        FROM office_members om
        JOIN offices o ON o.id = om.office_id
        JOIN office_meeting_sessions oms ON oms.office_id = om.office_id
        LEFT JOIN office_zones oz ON oz.id = oms.zone_id
        LEFT JOIN LATERAL (
          SELECT
            COUNT(*) FILTER (WHERE status = 'ready')::int AS ready_recording_count,
            (ARRAY_AGG(share_token ORDER BY created_at DESC) FILTER (WHERE status = 'ready' AND share_token IS NOT NULL))[1] AS latest_recording_token
          FROM office_recordings
          WHERE meeting_session_id = oms.id
            AND status <> 'archived'
        ) recording_summary ON TRUE
        WHERE om.client_user_id = $1
          AND oms.status <> 'cancelled'
        ORDER BY
          CASE
            WHEN oms.status = 'live' THEN 0
            WHEN oms.status = 'planned' THEN 1
            ELSE 2
          END ASC,
          CASE
            WHEN oms.status IN ('live', 'planned')
             AND (oms.consent #>> '{setup,scheduled_start_at}') ~ '^\\d{4}-\\d{2}-\\d{2}T'
            THEN (oms.consent #>> '{setup,scheduled_start_at}')::timestamptz
            ELSE NULL
          END ASC NULLS LAST,
          oms.created_at DESC
        LIMIT 6
      `, [clientUser.id])
    }) : []

    const upcomingDeadlines = loadOperations && canViewProjects
      ? await safeQuery<any[]>('upcomingDeadlines', [], async () => queryRows(`
      SELECT
        t.id,
        t.title,
        t.due_date,
        p.name as project_name,
        ts.name as status_name,
        ts.color as status_color
      FROM tasks t
      JOIN projects p ON t.project_id = p.id
      JOIN task_statuses ts ON t.status_id = ts.id
      WHERE p.client_id = $1
        AND t.due_date >= CURRENT_DATE
        AND t.due_date <= CURRENT_DATE + INTERVAL '14 days'
        AND t.status_is_final = false
      ORDER BY t.due_date ASC
      LIMIT 10
    `, [clientId]))
      : []

    const emptyBookedJobHealth = {
      active_jobs: 0,
      overdue_jobs: 0,
      due_soon_jobs: 0,
      completed_last_30: 0,
      next_due_date: null
    }
    const bookedJobHealth = loadEnterprise && canViewProjects
      ? await safeQuery('bookedJobHealth', emptyBookedJobHealth, async () => queryOne(`
      SELECT
        COUNT(*) FILTER (WHERE p.status = 'active') AS active_jobs,
        COUNT(*) FILTER (
          WHERE p.status = 'active'
            AND p.due_date IS NOT NULL
            AND p.due_date < CURRENT_DATE
        ) AS overdue_jobs,
        COUNT(*) FILTER (
          WHERE p.status = 'active'
            AND p.due_date >= CURRENT_DATE
            AND p.due_date <= CURRENT_DATE + INTERVAL '14 days'
        ) AS due_soon_jobs,
        COUNT(*) FILTER (
          WHERE p.status = 'completed'
            AND p.updated_at >= NOW() - INTERVAL '30 days'
        ) AS completed_last_30,
        MIN(p.due_date) FILTER (
          WHERE p.status = 'active'
            AND p.due_date >= CURRENT_DATE
        ) AS next_due_date
      FROM projects p
      WHERE p.client_id = $1
    `, [clientId]))
      : emptyBookedJobHealth

    const billingHealth = loadEnterprise && clientUser.permissions.canViewInvoices
      ? await safeQuery('billingHealth', {
          outstanding_count: 0,
          overdue_count: 0,
          outstanding_amount: 0,
          aged_60_amount: 0,
          aged_60_count: 0,
          paid_last_90: 0,
          last_paid_at: null,
          next_due_date: null
        }, async () => queryOne(`
          SELECT
            COUNT(*) FILTER (WHERE status IN ('sent', 'overdue')) AS outstanding_count,
            COUNT(*) FILTER (
              WHERE status = 'overdue'
                OR (status = 'sent' AND due_date < CURRENT_DATE)
            ) AS overdue_count,
            COALESCE(SUM(CASE WHEN status IN ('sent', 'overdue') THEN total_amount - amount_paid ELSE 0 END), 0) AS outstanding_amount,
            COALESCE(SUM(CASE WHEN status IN ('sent', 'overdue') AND due_date < CURRENT_DATE - INTERVAL '60 days' THEN total_amount - amount_paid ELSE 0 END), 0) AS aged_60_amount,
            COUNT(*) FILTER (WHERE status IN ('sent', 'overdue') AND due_date < CURRENT_DATE - INTERVAL '60 days') AS aged_60_count,
            COALESCE(SUM(CASE WHEN status = 'paid' AND paid_date >= CURRENT_DATE - INTERVAL '90 days' THEN total_amount ELSE 0 END), 0) AS paid_last_90,
            MAX(paid_date) FILTER (WHERE status = 'paid') AS last_paid_at,
            MIN(due_date) FILTER (WHERE status IN ('sent', 'overdue')) AS next_due_date
          FROM invoices
          WHERE client_id = $1
        `, [clientId]))
      : null

    const campaignHealth = loadAnalytics && clientUser.permissions.canViewAnalytics
      ? await safeQuery('campaignHealth', {
          campaigns: 0,
          platforms: 0,
          spend: 0,
          impressions: 0,
          clicks: 0,
          conversions: 0,
          last_synced_at: null
        }, async () => queryOne(`
        SELECT
          COUNT(DISTINCT COALESCE(NULLIF(ms.campaign_id, ''), ms.id::text)) AS campaigns,
          COUNT(DISTINCT ms.platform) AS platforms,
          COALESCE(SUM(ms.actual_spend), 0) AS spend,
          COALESCE(SUM(ms.impressions), 0) AS impressions,
          COALESCE(SUM(ms.clicks), 0) AS clicks,
          COALESCE(SUM(ms.conversions), 0) AS conversions,
          MAX(ms.synced_at) AS last_synced_at
        FROM media_spend ms
        WHERE ${buildClientCondition(1)}
          AND ms.period::text >= TO_CHAR(CURRENT_DATE - INTERVAL '90 days', 'YYYY-MM')
      `, [clientId]))
      : null

    const leadHealth = loadAnalytics && clientUser.permissions.canViewAnalytics
      ? await safeQuery('leadHealth', {
          visible_leads: 0,
          leads_last_30: 0,
          contacted_leads_last_30: 0,
          uncontacted_leads_last_30: 0,
          won_leads: 0,
          avg_response_minutes_last_30: null
        }, async () => queryOne(`
        SELECT
          COUNT(*) AS visible_leads,
          COUNT(*) FILTER (WHERE l.submitted_at >= NOW() - INTERVAL '30 days') AS leads_last_30,
          COUNT(*) FILTER (WHERE l.submitted_at >= NOW() - INTERVAL '30 days' AND l.contacted_at IS NOT NULL) AS contacted_leads_last_30,
          COUNT(*) FILTER (
            WHERE l.submitted_at >= NOW() - INTERVAL '30 days'
              AND l.contacted_at IS NULL
              AND l.status IN ('new', 'contacted', 'qualified')
          ) AS uncontacted_leads_last_30,
          COUNT(*) FILTER (WHERE l.status = 'won') AS won_leads,
          AVG(EXTRACT(EPOCH FROM (l.contacted_at - l.submitted_at)) / 60)
            FILTER (WHERE l.submitted_at >= NOW() - INTERVAL '30 days' AND l.contacted_at IS NOT NULL) AS avg_response_minutes_last_30
        FROM leads l
        WHERE l.client_id = $1
          AND l.deleted_at IS NULL
          AND ${PORTAL_VISIBLE_LEADS_EXISTS}
      `, [clientId]))
      : null

    const emptyPortalAccessHealth = {
      total_users: 0,
      active_users: 0,
      pending_users: 0,
      last_login_at: null
    }
    const portalAccessHealth = loadEnterprise
      && (clientUser.isPrimaryContact || clientUser.permissions.canInviteUsers)
      ? await safeQuery('portalAccessHealth', emptyPortalAccessHealth, async () => queryOne(`
      SELECT
        COUNT(*) AS total_users,
        COUNT(*) FILTER (WHERE status = 'active') AS active_users,
        COUNT(*) FILTER (WHERE status = 'pending') AS pending_users,
        MAX(last_login_at) AS last_login_at
      FROM client_users
      WHERE client_id = $1
        AND email NOT LIKE '%@portal-access.local'
        AND COALESCE(title, '') <> 'Agency portal access'
    `, [clientId]))
      : emptyPortalAccessHealth

    const emptyLeadStats = {
      total: 0,
      new: 0,
      contacted: 0,
      won: 0
    }
    const leadStats = loadAnalytics
      ? await safeQuery('leadStats', emptyLeadStats, async () => queryOne(`
      SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN status = 'new' THEN 1 END) as new,
        COUNT(CASE WHEN status = 'contacted' THEN 1 END) as contacted,
        COUNT(CASE WHEN status = 'won' THEN 1 END) as won
        FROM leads l
        WHERE l.client_id = $1
          AND l.deleted_at IS NULL
           AND ${PORTAL_VISIBLE_LEADS_EXISTS}
    `, [clientId]))
      : emptyLeadStats

    const emptyContentHealth = {
      briefs_total: 0,
      briefs_open: 0,
      briefs_needs_info: 0,
      briefs_urgent: 0,
      briefs_overdue: 0,
      briefs_submitted_30d: 0,
      deliverables_visible: 0,
      deliverables_approved: 0,
      deliverables_final: 0,
      deliverables_recent_30d: 0,
      last_published_at: null
    }
    const contentHealth = loadEnterprise
      ? await safeQuery('contentHealth', emptyContentHealth, async () => queryOne(`
      SELECT
        COALESCE(br.briefs_total, 0) AS briefs_total,
        COALESCE(br.briefs_open, 0) AS briefs_open,
        COALESCE(br.briefs_needs_info, 0) AS briefs_needs_info,
        COALESCE(br.briefs_urgent, 0) AS briefs_urgent,
        COALESCE(br.briefs_overdue, 0) AS briefs_overdue,
        COALESCE(br.briefs_submitted_30d, 0) AS briefs_submitted_30d,
        COALESCE(dl.deliverables_visible, 0) AS deliverables_visible,
        COALESCE(dl.deliverables_approved, 0) AS deliverables_approved,
        COALESCE(dl.deliverables_final, 0) AS deliverables_final,
        COALESCE(dl.deliverables_recent_30d, 0) AS deliverables_recent_30d,
        dl.last_published_at
      FROM (SELECT $1::uuid AS client_id) c
      LEFT JOIN (
        SELECT
          client_id,
          COUNT(*) AS briefs_total,
          COUNT(*) FILTER (WHERE status NOT IN ('completed', 'cancelled', 'rejected')) AS briefs_open,
          COUNT(*) FILTER (WHERE status = 'needs_info') AS briefs_needs_info,
          COUNT(*) FILTER (
            WHERE priority = 'urgent'
              AND status NOT IN ('completed', 'cancelled', 'rejected')
          ) AS briefs_urgent,
          COUNT(*) FILTER (
            WHERE status NOT IN ('completed', 'cancelled', 'rejected')
              AND requested_deadline IS NOT NULL
              AND requested_deadline < CURRENT_DATE
          ) AS briefs_overdue,
          COUNT(*) FILTER (WHERE submitted_at >= NOW() - INTERVAL '30 days') AS briefs_submitted_30d
        FROM briefs
        WHERE client_id = $1
        GROUP BY client_id
      ) br ON br.client_id = c.client_id
      LEFT JOIN (
        SELECT
          client_id,
          COUNT(*) FILTER (WHERE is_visible_to_client = true) AS deliverables_visible,
          COUNT(*) FILTER (WHERE status = 'approved') AS deliverables_approved,
          COUNT(*) FILTER (WHERE is_final = true) AS deliverables_final,
          COUNT(*) FILTER (
            WHERE is_visible_to_client = true
              AND created_at >= NOW() - INTERVAL '30 days'
          ) AS deliverables_recent_30d,
          MAX(published_at) FILTER (WHERE is_visible_to_client = true) AS last_published_at
        FROM client_deliverables
        WHERE client_id = $1
        GROUP BY client_id
      ) dl ON dl.client_id = c.client_id
    `, [clientId]))
      : emptyContentHealth

    const recentLeads = loadAnalytics
      ? await safeQuery<any[]>('recentLeads', [], async () => queryRows(`
      SELECT
        l.id,
        l.source,
        l.form_name,
        l.submitted_at,
        l.field_data,
        l.status,
        l.campaign_name
      FROM leads l
      WHERE l.client_id = $1
        AND l.deleted_at IS NULL
        AND ${PORTAL_VISIBLE_LEADS_EXISTS}
      ORDER BY l.submitted_at DESC
      LIMIT 5
    `, [clientId]))
      : []

    return {
      client: {
        id: client?.id,
        name: client?.name,
        logoUrl: client?.logo_url,
        status: client?.is_active ? 'active' : 'inactive',
        memberSince: client?.created_at
      },
      projects: {
        stats: {
          total: Number(projectStats?.total || 0),
          active: Number(projectStats?.active || 0),
          completed: Number(projectStats?.completed || 0),
          onHold: Number(projectStats?.on_hold || 0)
        },
        active: activeProjects.map(p => ({
          id: p.id,
          name: p.name,
          status: p.status,
          startDate: p.start_date,
          dueDate: p.due_date,
          budget: canViewBudgets ? Number(p.budget || 0) : null,
          progressPercent: Math.round(Number(p.progress_percent || 0)),
          totalTasks: Number(p.total_tasks || 0),
          completedTasks: Number(p.completed_tasks || 0)
        })),
        upcoming: upcomingJobs.map(p => ({
          id: p.id,
          name: p.name,
          status: p.status,
          startDate: p.start_date,
          dueDate: p.due_date,
          budget: canViewBudgets ? Number(p.budget || 0) : null,
          totalTasks: Number(p.total_tasks || 0),
          completedTasks: Number(p.completed_tasks || 0)
        })),
        completedRecent: completedJobs.map(p => ({
          id: p.id,
          name: p.name,
          status: p.status,
          startDate: p.start_date,
          dueDate: p.due_date,
          budget: canViewBudgets ? Number(p.budget || 0) : null,
          completedAt: p.updated_at,
          totalTasks: Number(p.total_tasks || 0),
          completedTasks: Number(p.completed_tasks || 0)
        }))
      },
      approvals: {
        pending: pendingApprovals.map(a => ({
          id: a.id,
          type: a.approval_type,
          title: a.title,
          dueDate: a.due_date,
          requestedAt: a.requested_at,
          projectName: a.project_name,
          requestedByName: a.requested_by_name
        })),
        pendingCount: pendingApprovals.length
      },
      gallery: {
        recent: recentDeliverables.map(d => ({
          id: d.id,
          title: d.title,
          type: d.deliverable_type,
          thumbnailUrl: d.thumbnail_url,
          status: d.status,
          publishedAt: d.published_at,
          projectName: d.project_name
        }))
      },
      invoices: {
        stats: {
          total: Number(invoiceStats?.total || 0),
          paid: Number(invoiceStats?.paid || 0),
          outstanding: Number(invoiceStats?.outstanding || 0),
          totalPaid: Number(invoiceStats?.total_paid || 0),
          totalOutstanding: Number(invoiceStats?.total_outstanding || 0)
        },
        outstanding: outstandingInvoices.map(i => ({
          id: i.id,
          invoiceNumber: i.invoice_number,
          totalAmount: Number(i.total_amount || 0),
          amountPaid: Number(i.amount_paid || 0),
          amountDue: Number(i.total_amount || 0) - Number(i.amount_paid || 0),
          dueDate: i.due_date,
          status: i.status
        }))
      },
      requests: {
        stats: {
          total: Number(requestStats?.total || 0),
          submitted: Number(requestStats?.submitted || 0),
          needsReview: Number(requestStats?.needs_review || 0),
          inProgress: Number(requestStats?.in_progress || 0),
          open: Number(requestStats?.open || 0),
          resolved: Number(requestStats?.resolved || 0)
        },
        recent: recentRequests.map(r => ({
          id: r.id,
          requestType: r.request_type,
          title: r.title,
          priority: r.priority,
          status: r.status,
          assignedName: r.assigned_name,
          createdAt: r.created_at
        }))
      },
      team: {
        members: teamMembers.map(m => ({
          id: m.id,
          name: m.name,
          email: m.email,
          phone: m.phone,
          avatarUrl: m.avatar_url,
          role: m.role,
          department: m.department
        }))
      },
      enterprise: {
        jobs: {
          active: Number(bookedJobHealth?.active_jobs || 0),
          overdue: Number(bookedJobHealth?.overdue_jobs || 0),
          dueSoon: Number(bookedJobHealth?.due_soon_jobs || 0),
          completedLast30: Number(bookedJobHealth?.completed_last_30 || 0),
          nextDueDate: bookedJobHealth?.next_due_date || null
        },
        billing: clientUser.permissions.canViewInvoices
          ? {
              outstandingCount: Number(billingHealth?.outstanding_count || 0),
              overdueCount: Number(billingHealth?.overdue_count || 0),
              outstandingAmount: Number(billingHealth?.outstanding_amount || 0),
              aged60Amount: Number(billingHealth?.aged_60_amount || 0),
              aged60Count: Number(billingHealth?.aged_60_count || 0),
              paidLast90: Number(billingHealth?.paid_last_90 || 0),
              lastPaidAt: billingHealth?.last_paid_at || null,
              nextDueDate: billingHealth?.next_due_date || null
            }
          : null,
        campaigns: clientUser.permissions.canViewAnalytics
          ? {
              campaigns: Number(campaignHealth?.campaigns || 0),
              platforms: Number(campaignHealth?.platforms || 0),
              spend: toNum(campaignHealth?.spend),
              impressions: toNum(campaignHealth?.impressions),
              clicks: toNum(campaignHealth?.clicks),
              conversions: toNum(campaignHealth?.conversions),
              leadsLast30: Number(leadHealth?.leads_last_30 || 0),
              visibleLeads: Number(leadHealth?.visible_leads || 0),
              contactedLeadsLast30: Number(leadHealth?.contacted_leads_last_30 || 0),
              uncontactedLeadsLast30: Number(leadHealth?.uncontacted_leads_last_30 || 0),
              wonLeads: Number(leadHealth?.won_leads || 0),
              avgResponseMinutesLast30: leadHealth?.avg_response_minutes_last_30 == null
                ? null
                : Math.round(toNum(leadHealth.avg_response_minutes_last_30)),
              costPerLead: Number(leadHealth?.leads_last_30 || 0) > 0
                ? toNum(campaignHealth?.spend) / Number(leadHealth?.leads_last_30 || 0)
                : null,
              lastSyncedAt: campaignHealth?.last_synced_at || null
            }
          : null,
        access: {
          totalUsers: Number(portalAccessHealth?.total_users || 0),
          activeUsers: Number(portalAccessHealth?.active_users || 0),
          pendingUsers: Number(portalAccessHealth?.pending_users || 0),
          lastLoginAt: portalAccessHealth?.last_login_at || null
        },
        content: {
          briefsTotal: Number(contentHealth?.briefs_total || 0),
          briefsOpen: Number(contentHealth?.briefs_open || 0),
          briefsNeedsInfo: Number(contentHealth?.briefs_needs_info || 0),
          briefsUrgent: Number(contentHealth?.briefs_urgent || 0),
          briefsOverdue: Number(contentHealth?.briefs_overdue || 0),
          briefsSubmitted30d: Number(contentHealth?.briefs_submitted_30d || 0),
          deliverablesVisible: Number(contentHealth?.deliverables_visible || 0),
          deliverablesApproved: Number(contentHealth?.deliverables_approved || 0),
          deliverablesFinal: Number(contentHealth?.deliverables_final || 0),
          deliverablesRecent30d: Number(contentHealth?.deliverables_recent_30d || 0),
          lastPublishedAt: contentHealth?.last_published_at || null
        }
      },
      meetings: {
        upcoming: meetings.map(m => ({
          id: m.id,
          officeId: m.office_id,
          officeName: m.office_name,
          title: m.title,
          joinPath: `/lobby/${m.office_id}?meeting=${encodeURIComponent(String(m.id))}`,
          status: m.status,
          source: m.source,
          startedAt: m.started_at,
          endedAt: m.ended_at,
          createdAt: m.created_at,
          scheduledStartAt: m.scheduled_start_at,
          durationMinutes: m.duration_minutes ? Number(m.duration_minutes) : null,
          zoneName: m.zone_name,
          zoneSlug: m.zone_slug,
          readyRecordingCount: Number(m.ready_recording_count || 0),
          latestRecordingToken: m.latest_recording_token
        })),
        stats: {
          totalVisible: meetings.length,
          live: meetings.filter(m => m.status === 'live').length,
          planned: meetings.filter(m => m.status === 'planned').length,
          recordings: meetings.reduce((sum, m) => sum + Number(m.ready_recording_count || 0), 0)
        }
      },
      upcomingDeadlines: upcomingDeadlines.map(t => ({
        id: t.id,
        title: t.title,
        dueDate: t.due_date,
        projectName: t.project_name,
        status: { name: t.status_name, color: t.status_color }
      })),
      leads: {
        stats: {
          total: Number(leadStats?.total || 0),
          new: Number(leadStats?.new || 0),
          contacted: Number(leadStats?.contacted || 0),
          won: Number(leadStats?.won || 0)
        },
        recent: recentLeads.map(l => ({
          id: l.id,
          source: l.source,
          formName: l.form_name,
          submittedAt: l.submitted_at,
          fieldData: l.field_data,
          status: l.status,
          campaignName: l.campaign_name
        }))
      },
      recentActivity: recentActivity.map(a => ({
        id: a.id,
        action: a.action,
        entityType: a.entity_type,
        entityId: a.entity_id,
        details: a.details,
        createdAt: a.created_at,
        userName: a.user_name
      }))
    }
  } catch (error: unknown) {
    if (
      error
      && typeof error === 'object'
      && 'statusCode' in error
    ) {
      throw error
    }
    console.error('Failed to fetch dashboard:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch dashboard'
    })
  }
})
