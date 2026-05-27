/**
 * Client Portal Dashboard
 * GET /api/agency/client-portal/dashboard
 *
 * Query params:
 * - clientId: Client ID (required)
 *
 * Returns comprehensive dashboard data for the client portal
 */

import { queryOne, queryRows } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

const toNumber = (value: string | number | null | undefined) => Number(value || 0)

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const query = getQuery(event)

  const clientId = query.clientId as string

  if (!clientId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Client ID is required'
    })
  }

  try {
    // Verify client exists
    const client = await queryOne(`
      SELECT
        id, name, logo_url, status, billing_type, retainer_amount,
        created_at
      FROM agency_clients
      WHERE id = $1
    `, [clientId])

    if (!client) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Client not found'
      })
    }

    // Get project stats
    const projectStats = await queryOne(`
      SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN status = 'active' THEN 1 END) as active,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed,
        COUNT(CASE WHEN status = 'on_hold' THEN 1 END) as on_hold
      FROM projects
      WHERE client_id = $1
    `, [clientId])

    // Get active projects with progress
    const activeProjects = await queryRows(`
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
    `, [clientId])

    // Get pending approvals
    const pendingApprovals = await queryRows(`
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
    `, [clientId])

    // Get recent deliverables
    const recentDeliverables = await queryRows(`
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
      WHERE cd.client_id = $1
        AND cd.is_visible_to_client = true
      ORDER BY cd.published_at DESC NULLS LAST, cd.created_at DESC
      LIMIT 8
    `, [clientId])

    // Get invoice stats
    const invoiceStats = await queryOne(`
      SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN status = 'paid' THEN 1 END) as paid,
        COUNT(CASE WHEN status IN ('sent', 'overdue') THEN 1 END) as outstanding,
        COALESCE(SUM(CASE WHEN status = 'paid' THEN total_amount ELSE 0 END), 0) as total_paid,
        COALESCE(SUM(CASE WHEN status IN ('sent', 'overdue') THEN total_amount - amount_paid ELSE 0 END), 0) as total_outstanding
      FROM invoices
      WHERE client_id = $1
    `, [clientId])

    // Get outstanding invoices
    const outstandingInvoices = await queryRows(`
      SELECT
        id,
        invoice_number,
        total_amount,
        amount_paid,
        due_date,
        status
      FROM invoices
      WHERE client_id = $1 AND status IN ('sent', 'overdue')
      ORDER BY due_date ASC
      LIMIT 5
    `, [clientId])

    // Get recent activity
    const recentActivity = await queryRows(`
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
    `, [clientId])

    // Get upcoming milestones/deadlines
    const upcomingDeadlines = await queryRows(`
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
    `, [clientId])

    // Get gallery summary
    const gallerySummary = await queryOne(`
      SELECT
        COUNT(*) as total_deliverables,
        COUNT(CASE WHEN status = 'approved' THEN 1 END) as approved,
        COUNT(CASE WHEN is_featured THEN 1 END) as featured,
        COUNT(DISTINCT dc.id) as collections
      FROM client_deliverables cd
      LEFT JOIN deliverable_collections dc ON cd.client_id = dc.client_id
      WHERE cd.client_id = $1 AND cd.is_visible_to_client = true
    `, [clientId])

    const requestHealth = await queryOne(`
      SELECT
        COUNT(*) FILTER (WHERE status NOT IN ('completed', 'closed', 'cancelled')) AS open_requests,
        COUNT(*) FILTER (
          WHERE priority = 'urgent'
            AND status NOT IN ('completed', 'closed', 'cancelled')
        ) AS urgent_requests,
        COUNT(*) FILTER (
          WHERE assigned_to IS NULL
            AND status NOT IN ('completed', 'closed', 'cancelled')
        ) AS unassigned_requests,
        COUNT(*) FILTER (
          WHERE status NOT IN ('completed', 'closed', 'cancelled')
            AND desired_deadline IS NOT NULL
            AND desired_deadline < CURRENT_DATE
        ) AS overdue_requests,
        COALESCE(SUM(CASE
          WHEN request_type = 'job_request'
            AND status NOT IN ('completed', 'closed', 'cancelled')
          THEN estimated_budget ELSE 0
        END), 0) AS open_requested_budget
      FROM client_requests
      WHERE client_id = $1
    `, [clientId])

    const leadHealth = await queryOne(`
      SELECT
        COUNT(*) FILTER (WHERE l.submitted_at >= NOW() - INTERVAL '30 days') AS leads_last_30,
        COUNT(*) FILTER (
          WHERE l.submitted_at >= NOW() - INTERVAL '30 days'
            AND l.contacted_at IS NULL
            AND l.status IN ('new', 'contacted', 'qualified')
        ) AS uncontacted_leads_last_30,
        COUNT(*) FILTER (
          WHERE l.submitted_at >= NOW() - INTERVAL '30 days'
            AND l.status = 'won'
        ) AS won_leads_last_30,
        AVG(EXTRACT(EPOCH FROM (l.contacted_at - l.submitted_at)) / 60)
          FILTER (WHERE l.submitted_at >= NOW() - INTERVAL '30 days' AND l.contacted_at IS NOT NULL) AS avg_response_minutes_last_30
      FROM leads l
      JOIN lead_form_rules r ON r.id = l.rule_id
      JOIN lead_form_destinations d ON d.rule_id = r.id
      WHERE l.client_id = $1
        AND l.deleted_at IS NULL
        AND r.enabled = TRUE
        AND d.destination_type = 'portal'
    `, [clientId])

    const accessHealth = await queryOne(`
      SELECT
        COUNT(*) AS total_users,
        COUNT(*) FILTER (WHERE status = 'active') AS active_users,
        COUNT(*) FILTER (WHERE status = 'pending') AS pending_users,
        COUNT(*) FILTER (WHERE email LIKE '%@portal-access.local') AS agency_access_users,
        MAX(last_login_at) AS last_login_at
      FROM client_users
      WHERE client_id = $1
    `, [clientId])

    const billingHealth = await queryOne(`
      SELECT
        COUNT(*) FILTER (
          WHERE status = 'overdue'
            OR (status = 'sent' AND due_date < CURRENT_DATE)
        ) AS overdue_invoices,
        COUNT(*) FILTER (
          WHERE status IN ('sent', 'overdue')
            AND due_date >= CURRENT_DATE
            AND due_date <= CURRENT_DATE + INTERVAL '7 days'
        ) AS due_next_7_count,
        COALESCE(SUM(CASE
          WHEN status IN ('sent', 'overdue')
            AND due_date >= CURRENT_DATE
            AND due_date <= CURRENT_DATE + INTERVAL '7 days'
          THEN total_amount - amount_paid ELSE 0
        END), 0) AS due_next_7_amount,
        COALESCE(SUM(CASE
          WHEN status = 'paid'
            AND paid_date >= CURRENT_DATE - INTERVAL '90 days'
          THEN total_amount ELSE 0
        END), 0) AS paid_last_90,
        COALESCE(AVG(CASE
          WHEN status = 'paid'
            AND paid_date IS NOT NULL
            AND issue_date IS NOT NULL
          THEN paid_date - issue_date
        END), 0) AS avg_days_to_pay
      FROM invoices
      WHERE client_id = $1
    `, [clientId])

    const contentHealth = await queryOne(`
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
    `, [clientId])

    return {
      client: {
        id: client.id,
        name: client.name,
        logoUrl: client.logo_url,
        status: client.status,
        billingType: client.billing_type,
        retainerAmount: Number(client.retainer_amount || 0),
        memberSince: client.created_at
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
          budget: Number(p.budget || 0),
          progressPercent: Math.round(Number(p.progress_percent || 0)),
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
        })),
        summary: {
          totalDeliverables: Number(gallerySummary?.total_deliverables || 0),
          approved: Number(gallerySummary?.approved || 0),
          featured: Number(gallerySummary?.featured || 0),
          collections: Number(gallerySummary?.collections || 0)
        }
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
      upcomingDeadlines: upcomingDeadlines.map(t => ({
        id: t.id,
        title: t.title,
        dueDate: t.due_date,
        projectName: t.project_name,
        status: {
          name: t.status_name,
          color: t.status_color
        }
      })),
      recentActivity: recentActivity.map(a => ({
        id: a.id,
        action: a.action,
        entityType: a.entity_type,
        entityId: a.entity_id,
        details: a.details,
        createdAt: a.created_at,
        userName: a.user_name
      })),
      enterprise: {
        requests: {
          open: toNumber(requestHealth?.open_requests),
          urgent: toNumber(requestHealth?.urgent_requests),
          unassigned: toNumber(requestHealth?.unassigned_requests),
          overdue: toNumber(requestHealth?.overdue_requests),
          openRequestedBudget: toNumber(requestHealth?.open_requested_budget)
        },
        leads: {
          leadsLast30: toNumber(leadHealth?.leads_last_30),
          uncontactedLast30: toNumber(leadHealth?.uncontacted_leads_last_30),
          wonLast30: toNumber(leadHealth?.won_leads_last_30),
          avgResponseMinutesLast30: leadHealth?.avg_response_minutes_last_30 == null
            ? null
            : Math.round(toNumber(leadHealth.avg_response_minutes_last_30))
        },
        access: {
          totalUsers: toNumber(accessHealth?.total_users),
          activeUsers: toNumber(accessHealth?.active_users),
          pendingUsers: toNumber(accessHealth?.pending_users),
          agencyAccessUsers: toNumber(accessHealth?.agency_access_users),
          lastLoginAt: accessHealth?.last_login_at || null
        },
        billing: {
          overdueInvoices: toNumber(billingHealth?.overdue_invoices),
          dueNext7Count: toNumber(billingHealth?.due_next_7_count),
          dueNext7Amount: toNumber(billingHealth?.due_next_7_amount),
          paidLast90: toNumber(billingHealth?.paid_last_90),
          averageDaysToPay: Math.round(toNumber(billingHealth?.avg_days_to_pay))
        },
        content: {
          briefsTotal: toNumber(contentHealth?.briefs_total),
          briefsOpen: toNumber(contentHealth?.briefs_open),
          briefsNeedsInfo: toNumber(contentHealth?.briefs_needs_info),
          briefsUrgent: toNumber(contentHealth?.briefs_urgent),
          briefsOverdue: toNumber(contentHealth?.briefs_overdue),
          briefsSubmitted30d: toNumber(contentHealth?.briefs_submitted_30d),
          deliverablesVisible: toNumber(contentHealth?.deliverables_visible),
          deliverablesApproved: toNumber(contentHealth?.deliverables_approved),
          deliverablesFinal: toNumber(contentHealth?.deliverables_final),
          deliverablesRecent30d: toNumber(contentHealth?.deliverables_recent_30d),
          lastPublishedAt: contentHealth?.last_published_at || null
        }
      }
    }
  } catch (error) {
    if (error && typeof error === 'object' && 'statusCode' in error) throw error
    console.error('Failed to fetch dashboard:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch dashboard'
    })
  }
})
