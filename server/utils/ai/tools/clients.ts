import { z } from 'zod'
import { queryRows, queryOne } from '~~/server/utils/db'
import type { AiTool } from '../toolRegistry'
import { ok, fail, type ToolContext, type ToolResult } from '../toolContext'

const params = z.object({ clientName: z.string() })
type Args = z.infer<typeof params>

/** Minimal client row — only the real `agency_clients` columns we project. */
type ClientRow = { id: string, name: string, is_active: boolean, billing_type: string | null }
/** Profitability snapshot, or null when no project-derived figures exist for the client. */
type MarginSnapshot = { totalRevenue: number, grossProfit: number, grossMargin: number } | null

export type ClientsDeps = {
  /** Fuzzy name resolution against agency_clients (ILIKE, %/_ escaped). May return 0, 1, or many. */
  findClients: (name: string, ctx: ToolContext) => Promise<ClientRow[]>
  briefCount: (clientId: string, ctx: ToolContext) => Promise<number>
  marginSnapshot: (clientId: string, ctx: ToolContext) => Promise<MarginSnapshot>
}

// Real wiring against Postgres. Columns verified against
// server/api/agency/clients/{index.get,[id].get}.ts: agency_clients has
// id/name/is_active/billing_type; briefs carries client_id; profitability is
// derived from projects + time_entries + project_expenses (same shape as the
// list endpoint's `stats` subquery), so the snapshot mirrors that calculation.
const defaultDeps: ClientsDeps = {
  findClients: async (name) => {
    const safe = name.replace(/[%_]/g, c => '\\' + c)
    return (await queryRows(
      `SELECT id, name, is_active, billing_type
         FROM agency_clients
        WHERE name ILIKE $1
        ORDER BY name
        LIMIT 25`,
      [`%${safe}%`],
    )) as ClientRow[]
  },
  briefCount: async (clientId) => {
    const r = await queryOne(
      `SELECT COUNT(*) AS total FROM briefs WHERE client_id = $1`,
      [clientId],
    )
    return Number(r?.total) || 0
  },
  marginSnapshot: async (clientId) => {
    const r = await queryOne(
      `SELECT
         COALESCE(SUM(p.budget_amount), 0) AS total_revenue,
         COALESCE(SUM(p.budget_amount), 0)
           - (COALESCE(SUM(t.labor_cost), 0) + COALESCE(SUM(e.expense_cost), 0)) AS gross_profit,
         COUNT(p.id) AS project_count
       FROM projects p
       LEFT JOIN (
         SELECT project_id, SUM(hours * hourly_rate) AS labor_cost
         FROM time_entries GROUP BY project_id
       ) t ON p.id = t.project_id
       LEFT JOIN (
         SELECT project_id, SUM(amount) AS expense_cost
         FROM project_expenses GROUP BY project_id
       ) e ON p.id = e.project_id
       WHERE p.client_id = $1`,
      [clientId],
    )
    // No projects → no profitability basis; surface null rather than a misleading 0%.
    if (!r || Number(r.project_count) === 0) return null
    const totalRevenue = Number(r.total_revenue) || 0
    const grossProfit = Number(r.gross_profit) || 0
    const grossMargin = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0
    return { totalRevenue, grossProfit, grossMargin }
  },
}

export async function getClientOverview(args: Args, ctx: ToolContext, deps: ClientsDeps = defaultDeps): Promise<ToolResult> {
  try {
    const matches = await deps.findClients(args.clientName, ctx)

    if (matches.length === 0) {
      return fail(`No client matching “${args.clientName}”.`)
    }
    if (matches.length > 1) {
      // Don't guess — let the model (or user) pick. Compact id+name only.
      return ok({ disambiguation: matches.map(c => ({ id: c.id, name: c.name })) })
    }

    const c = matches[0]!
    const [briefCount, marginSnapshot] = await Promise.all([
      deps.briefCount(c.id, ctx),
      deps.marginSnapshot(c.id, ctx),
    ])

    return ok({
      name: c.name,
      active: c.is_active,
      billingType: c.billing_type,
      briefCount,
      marginSnapshot,
    })
  } catch {
    return fail('Could not load client overview — the client database may be unavailable.')
  }
}

export const clientOverviewTool: AiTool<Args> = {
  name: 'get_client_overview',
  description: 'Look up one agency client by (partial) name and return a compact overview: active status, billing type, number of briefs, and a profitability/margin snapshot (revenue, gross profit, gross margin %). Use for "tell me about <client> / is <client> profitable / what billing is <client> on". If the name matches several clients it returns a disambiguation list to choose from; it does NOT return full financials, invoices, or per-project detail.',
  parameters: params,
  requiredPermission: 'CLIENTS',
  handler: (a, c) => getClientOverview(a, c),
}
