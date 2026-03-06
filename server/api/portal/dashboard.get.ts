/**
 * Client Portal Dashboard
 * GET /api/portal/dashboard
 */

import { queryOne, queryRows } from '~~/server/utils/db'
import { requireClientAuth } from '~~/server/utils/clientAuth'

export default defineEventHandler(async (event) => {
  const clientUser = await requireClientAuth(event)
  const clientId = clientUser.clientId

  try {
    const client = await queryOne(`
      SELECT id, name, logo_url, status, billing_type, retainer_amount, created_at
      FROM agency_clients
      WHERE id = $1
    `, [clientId])

    const projectStats = await queryOne(`
      SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN status = 'active' THEN 1 END) as active,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed,
        COUNT(CASE WHEN status = 'on_hold' THEN 1 END) as on_hold
      FROM projects
      WHERE client_id = $1
    `, [clientId])

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
           WHERE t.project_id = p.id AND ts.is_final = true)::float /
          NULLIF((SELECT COUNT(*) FROM tasks WHERE project_id = p.id), 0) * 100,
          0
        ) as progress_percent,
        (SELECT COUNT(*) FROM tasks WHERE project_id = p.id) as total_tasks,
        (SELECT COUNT(*) FROM tasks t
         JOIN task_statuses ts ON t.status_id = ts.id
         WHERE t.project_id = p.id AND ts.is_final = true) as completed_tasks
      FROM projects p
      WHERE p.client_id = $1 AND p.status = 'active'
      ORDER BY p.due_date ASC NULLS LAST
      LIMIT 10
    `, [clientId])

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
      WHERE cd.client_id = $1 AND cd.is_visible_to_client = true
      ORDER BY cd.published_at DESC NULLS LAST, cd.created_at DESC
      LIMIT 8
    `, [clientId])

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

    const outstandingInvoices = await queryRows(`
      SELECT id, invoice_number, total_amount, amount_paid, due_date, status
      FROM invoices
      WHERE client_id = $1 AND status IN ('sent', 'overdue')
      ORDER BY due_date ASC
      LIMIT 5
    `, [clientId])

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

    // Open client requests
    const requestStats = await queryOne(`
      SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN status = 'submitted' THEN 1 END) as submitted,
        COUNT(CASE WHEN status IN ('in_review', 'approved', 'in_progress') THEN 1 END) as in_progress
      FROM client_requests
      WHERE client_id = $1
    `, [clientId])

    const recentRequests = await queryRows(`
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
    `, [clientId])

    // Team members (project managers on active projects)
    const teamMembers = await queryRows(`
      SELECT DISTINCT ON (tm.id)
        tm.id, tm.name, tm.email, tm.phone, tm.avatar_url, tm.role, tm.department
      FROM team_members tm
      JOIN projects p ON p.project_manager_id = tm.id
      WHERE p.client_id = $1 AND p.status = 'active'
      ORDER BY tm.id
      LIMIT 5
    `, [clientId])

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
        AND ts.is_final = false
      ORDER BY t.due_date ASC
      LIMIT 10
    `, [clientId])

    return {
      client: {
        id: client?.id,
        name: client?.name,
        logoUrl: client?.logo_url,
        status: client?.status,
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
          inProgress: Number(requestStats?.in_progress || 0)
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
      upcomingDeadlines: upcomingDeadlines.map(t => ({
        id: t.id,
        title: t.title,
        dueDate: t.due_date,
        projectName: t.project_name,
        status: { name: t.status_name, color: t.status_color }
      })),
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
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Failed to fetch dashboard:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch dashboard'
    })
  }
})
