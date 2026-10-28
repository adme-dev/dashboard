/**
 * Agency Clients List Endpoint
 * Returns all clients with profitability summary from Postgres
 */

import { db, queryRows, queryRowsFresh } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'
import { cachedFetch } from '~~/server/utils/kv'
import { CLIENT_FINANCIAL_ACCESS_HEADER, isMarketingClientViewer } from '~~/server/utils/clients/marketingAccess'

/** Department directory: fresh, active-only, identity and project counts — no profitability or rates. */
async function listMarketingClients() {
  const clients = await queryRowsFresh<Record<string, unknown>>(`
    SELECT c.id, c.name, c.is_active, c.logo_url, c.created_at, c.updated_at,
           COALESCE(p.project_count, 0) AS project_count,
           COALESCE(p.active_projects, 0) AS active_projects
      FROM agency_clients c
      LEFT JOIN (
        SELECT client_id,
               COUNT(*) AS project_count,
               COUNT(*) FILTER (WHERE status = 'active') AS active_projects
          FROM projects
         GROUP BY client_id
      ) p ON p.client_id = c.id
     WHERE c.is_active = TRUE
     ORDER BY c.name
  `)
  return clients.map(c => ({
    id: c.id,
    name: c.name,
    isActive: c.is_active,
    logoUrl: c.logo_url || null,
    createdAt: c.created_at,
    updatedAt: c.updated_at,
    projectCount: Number(c.project_count) || 0,
    activeProjects: Number(c.active_projects) || 0
  }))
}

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)

  // The department never shares the cached financial list, and ignores `active`: inactive clients
  // are outside its authority whatever the query asks for.
  if (await isMarketingClientViewer(user.id)) {
    setResponseHeader(event, CLIENT_FINANCIAL_ACCESS_HEADER, 'marketing')
    setResponseHeader(event, 'cache-control', 'private, no-store')
    try {
      return await listMarketingClients()
    } catch (error) {
      console.error('Failed to fetch marketing clients:', error)
      throw createError({ statusCode: 500, statusMessage: 'Failed to fetch clients' })
    }
  }

  const query = getQuery(event)
  const activeOnly = query.active !== 'false'

  return cachedFetch(event, `agency:clients:${activeOnly}`, 120, async () => {
  try {
    // Get clients with aggregated profitability data
    const clients = await queryRows(`
      SELECT
        c.*,
        COALESCE(stats.total_revenue, 0) as total_revenue,
        COALESCE(stats.total_cost, 0) as total_cost,
        COALESCE(stats.gross_profit, 0) as gross_profit,
        CASE
          WHEN COALESCE(stats.total_revenue, 0) > 0
          THEN (COALESCE(stats.gross_profit, 0) / stats.total_revenue * 100)
          ELSE 0
        END as gross_margin,
        COALESCE(stats.project_count, 0) as project_count,
        COALESCE(stats.active_projects, 0) as active_projects
      FROM agency_clients c
      LEFT JOIN (
        SELECT
          p.client_id,
          SUM(p.budget_amount) as total_revenue,
          COALESCE(SUM(t.labor_cost), 0) + COALESCE(SUM(e.expense_cost), 0) as total_cost,
          SUM(p.budget_amount) - (COALESCE(SUM(t.labor_cost), 0) + COALESCE(SUM(e.expense_cost), 0)) as gross_profit,
          COUNT(p.id) as project_count,
          COUNT(CASE WHEN p.status = 'active' THEN 1 END) as active_projects
        FROM projects p
        LEFT JOIN (
          SELECT project_id, SUM(hours * hourly_rate) as labor_cost
          FROM time_entries
          GROUP BY project_id
        ) t ON p.id = t.project_id
        LEFT JOIN (
          SELECT project_id, SUM(amount) as expense_cost
          FROM project_expenses
          GROUP BY project_id
        ) e ON p.id = e.project_id
        GROUP BY p.client_id
      ) stats ON c.id = stats.client_id
      WHERE ($1 = false OR c.is_active = true)
      ORDER BY c.name
    `, [!activeOnly])

    // Transform snake_case to camelCase for frontend
    return clients.map(c => ({
      id: c.id,
      name: c.name,
      xeroContactId: c.xero_contact_id,
      billingType: c.billing_type,
      retainerAmount: c.retainer_amount ? Number(c.retainer_amount) : undefined,
      paymentTerms: c.payment_terms,
      hourlyRate: c.hourly_rate ? Number(c.hourly_rate) : undefined,
      mediaCommissionRate: c.media_commission_rate ? Number(c.media_commission_rate) : undefined,
      isActive: c.is_active,
      logoUrl: c.logo_url || null,
      notes: c.notes,
      createdAt: c.created_at,
      updatedAt: c.updated_at,
      // Profitability data
      totalRevenue: Number(c.total_revenue) || 0,
      totalCost: Number(c.total_cost) || 0,
      grossProfit: Number(c.gross_profit) || 0,
      grossMargin: Number(c.gross_margin) || 0,
      projectCount: Number(c.project_count) || 0,
      activeProjects: Number(c.active_projects) || 0,
    }))
  } catch (error) {
    console.error('Failed to fetch clients:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch clients'
    })
  }
  })
})
