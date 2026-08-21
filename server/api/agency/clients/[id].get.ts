/**
 * Get Single Client with Full Details
 * Returns client info, projects, time entries, invoices, and profitability
 */

import { queryOne, queryRows } from '~~/server/utils/db'
import { requireRole } from '~~/server/utils/auth'
import { PERMISSIONS } from '~~/server/utils/permissions'

export default defineEventHandler(async (event) => {
  // Match the page's `role-clients` gate: only CLIENTS-permission staff may read
  // full client financials (revenue, cost, invoices, time entries, team).
  await requireRole(event, PERMISSIONS.CLIENTS)

  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Client ID is required'
    })
  }

  try {
    // Get client details
    const client = await queryOne(`
      SELECT c.*, d.name AS portal_board_name
      FROM agency_clients c
      LEFT JOIN departments d ON d.id = c.portal_board_id AND d.is_active = TRUE
      WHERE c.id = $1
    `, [id])

    if (!client) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Client not found'
      })
    }

    // Get all projects for this client
    const projects = await queryRows(`
      SELECT
        p.*,
        COALESCE(t.total_hours, 0) as total_hours,
        COALESCE(t.labor_cost, 0) as labor_cost,
        COALESCE(e.expense_cost, 0) as expense_cost,
        COALESCE(t.labor_cost, 0) + COALESCE(e.expense_cost, 0) as total_cost
      FROM projects p
      LEFT JOIN (
        SELECT project_id, SUM(hours) as total_hours, SUM(hours * hourly_rate) as labor_cost
        FROM time_entries
        GROUP BY project_id
      ) t ON p.id = t.project_id
      LEFT JOIN (
        SELECT project_id, SUM(amount) as expense_cost
        FROM project_expenses
        GROUP BY project_id
      ) e ON p.id = e.project_id
      WHERE p.client_id = $1
      ORDER BY p.created_at DESC
    `, [id])

    // Get recent time entries across all projects
    const recentTimeEntries = await queryRows(`
      SELECT
        te.*,
        p.name as project_name,
        tm.name as user_name
      FROM time_entries te
      JOIN projects p ON te.project_id = p.id
      JOIN team_members tm ON te.user_id = tm.id
      WHERE p.client_id = $1
      ORDER BY te.date DESC
      LIMIT 20
    `, [id])

    // Get invoices for this client
    const invoices = await queryRows(`
      SELECT * FROM invoices
      WHERE client_id = $1
      ORDER BY issue_date DESC
      LIMIT 20
    `, [id])

    // Calculate summary stats
    const totalRevenue = projects.reduce((sum, p) => sum + Number(p.budget_amount || 0), 0)
    const totalCost = projects.reduce((sum, p) => sum + Number(p.total_cost || 0), 0)
    const totalHours = projects.reduce((sum, p) => sum + Number(p.total_hours || 0), 0)
    const grossProfit = totalRevenue - totalCost
    const grossMargin = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0

    const activeProjects = projects.filter(p => p.status === 'active').length
    const completedProjects = projects.filter(p => p.status === 'completed').length

    // Get media spend if applicable
    const mediaSpend = await queryRows(`
      SELECT * FROM media_spend
      WHERE client_id = $1
      ORDER BY period DESC, platform
      LIMIT 20
    `, [id])

    // Commission per row uses the row's own rate, falling back to the client's
    // configured rate when the row carries none (CSV/manual imports and pre-rate
    // syncs store commission_rate = 0). Rows and the summary share this so the
    // headline figure always matches the per-row breakdown.
    const clientCommissionRate = client.media_commission_rate ? Number(client.media_commission_rate) : 0
    const rowCommission = (ms: any) => {
      const rate = Number(ms.commission_rate) > 0 ? Number(ms.commission_rate) : clientCommissionRate
      return (Number(ms.actual_spend) || 0) * rate / 100
    }

    return {
      client: {
        id: client.id,
        name: client.name,
        xeroContactId: client.xero_contact_id,
        billingType: client.billing_type,
        retainerAmount: client.retainer_amount ? Number(client.retainer_amount) : null,
        paymentTerms: client.payment_terms,
        hourlyRate: client.hourly_rate ? Number(client.hourly_rate) : null,
        mediaCommissionRate: client.media_commission_rate ? Number(client.media_commission_rate) : null,
        isActive: client.is_active,
        notes: client.notes,
        contactEmail: client.contact_email,
        contactPhone: client.contact_phone,
        address: client.address,
        reportingTimezone: client.reporting_timezone,
        leadCaptureMode: client.lead_capture_mode || 'capture_only',
        portalBoardId: client.portal_board_id,
        portalBoardName: client.portal_board_name,
        createdAt: client.created_at,
        updatedAt: client.updated_at
      },
      projects: projects.map(p => ({
        id: p.id,
        name: p.name,
        status: p.status,
        budgetType: p.budget_type,
        budgetAmount: Number(p.budget_amount) || 0,
        startDate: p.start_date,
        endDate: p.end_date,
        totalHours: Number(p.total_hours) || 0,
        laborCost: Number(p.labor_cost) || 0,
        expenseCost: Number(p.expense_cost) || 0,
        totalCost: Number(p.total_cost) || 0,
        margin: Number(p.budget_amount) > 0
          ? ((Number(p.budget_amount) - Number(p.total_cost)) / Number(p.budget_amount)) * 100
          : 0
      })),
      recentTimeEntries: recentTimeEntries.map(te => ({
        id: te.id,
        projectName: te.project_name,
        userName: te.user_name,
        date: te.date,
        hours: Number(te.hours),
        hourlyRate: Number(te.hourly_rate),
        amount: Number(te.hours) * Number(te.hourly_rate),
        description: te.description,
        billable: te.billable
      })),
      invoices: invoices.map(inv => ({
        id: inv.id,
        invoiceNumber: inv.invoice_number,
        status: inv.status,
        issueDate: inv.issue_date,
        dueDate: inv.due_date,
        subtotal: Number(inv.subtotal) || 0,
        tax: Number(inv.tax) || 0,
        total: Number(inv.total) || 0
      })),
      mediaSpend: mediaSpend.map(ms => ({
        id: ms.id,
        platform: ms.platform,
        period: ms.period,
        budgetAllocated: Number(ms.budget_allocated) || 0,
        actualSpend: Number(ms.actual_spend) || 0,
        commissionRate: Number(ms.commission_rate) > 0 ? Number(ms.commission_rate) : clientCommissionRate,
        commission: rowCommission(ms)
      })),
      summary: {
        totalRevenue,
        totalCost,
        grossProfit,
        grossMargin,
        totalHours,
        totalProjects: projects.length,
        activeProjects,
        completedProjects,
        totalInvoiced: invoices.reduce((sum, inv) => sum + Number(inv.total || 0), 0),
        totalMediaSpend: mediaSpend.reduce((sum, ms) => sum + Number(ms.actual_spend || 0), 0),
        // Sum of per-row commission (with client-rate fallback, see rowCommission)
        // so the headline figure matches the per-row breakdown in the Media Spend tab.
        totalMediaCommission: mediaSpend.reduce((sum, ms) => sum + rowCommission(ms), 0),
        // Surfaced as a distinct metric — retainer revenue is recurring (per month),
        // intentionally NOT folded into project-budget revenue to stay consistent
        // with the clients list + analytics convention.
        retainerAmount: client.retainer_amount ? Number(client.retainer_amount) : 0
      }
    }
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Failed to fetch client:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch client details'
    })
  }
})
