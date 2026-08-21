import { z } from 'zod'
import { queryRows, queryOne } from '~~/server/utils/db'
import type { AiTool } from '../toolRegistry'
import { ok, fail, escapeLike, type ToolContext, type ToolResult } from '../toolContext'
import { buildDataHealth } from './responseContract'

/** Disambiguation cap; one extra row is fetched so truncation is declared (P-03). */
export const CLIENT_MATCH_CAP = 25

const params = z.object({ clientName: z.string() })
type Args = z.infer<typeof params>

/** Minimal client row — only the real `agency_clients` columns we project. */
type ClientRow = {
  id: string
  name: string
  is_active: boolean
  billing_type: string | null
  aliases?: string[] | null
  parent_client_id?: string | null
  parent_client_name?: string | null
}
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
    const safe = escapeLike(name)
    return (await queryRows(
      `SELECT c.id, c.name, c.is_active, c.billing_type, c.parent_client_id,
              parent.name AS parent_client_name,
              ARRAY(SELECT a.alias FROM agency_client_aliases a WHERE a.client_id = c.id ORDER BY a.alias) AS aliases
         FROM agency_clients c
         LEFT JOIN agency_clients parent ON parent.id = c.parent_client_id
        WHERE c.name ILIKE $1
           OR EXISTS (SELECT 1 FROM agency_client_aliases a WHERE a.client_id = c.id AND a.alias ILIKE $1)
        ORDER BY c.name
        LIMIT ${CLIENT_MATCH_CAP + 1}`,
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
         FROM time_entries
         WHERE project_id IN (SELECT id FROM projects WHERE client_id = $1)
         GROUP BY project_id
       ) t ON p.id = t.project_id
       LEFT JOIN (
         SELECT project_id, SUM(amount) AS expense_cost
         FROM project_expenses
         WHERE project_id IN (SELECT id FROM projects WHERE client_id = $1)
         GROUP BY project_id
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
      const truncated = matches.length > CLIENT_MATCH_CAP
      return ok({
        disambiguation: matches.slice(0, CLIENT_MATCH_CAP).map(c => ({ id: c.id, name: c.name })),
        limit: CLIENT_MATCH_CAP,
        truncatedAtSource: truncated,
        ...(truncated ? { note: `More than ${CLIENT_MATCH_CAP} clients match — narrow the name.` } : {}),
      })
    }

    const c = matches[0]!
    const [briefCount, marginSnapshot] = await Promise.all([
      deps.briefCount(c.id, ctx),
      deps.marginSnapshot(c.id, ctx),
    ])

    return ok({
      clientId: c.id,
      name: c.name,
      alternateNames: c.aliases ?? [],
      parentClient: c.parent_client_id
        ? { id: c.parent_client_id, name: c.parent_client_name ?? null }
        : null,
      active: c.is_active,
      billingType: c.billing_type,
      briefCount,
      marginSnapshot,
      ...buildDataHealth({ configured: true, expected: 2, withData: marginSnapshot ? 2 : 1 }),
    })
  } catch {
    return fail('Could not load client overview — the client database may be unavailable.')
  }
}

export const clientOverviewTool: AiTool<Args> = {
  name: 'get_client_overview',
  description: 'Resolve a canonical or alternate client name and return the stable client ID, alternate names, parent dealer group, active status, billing type, brief count, and profitability snapshot. Use this before reconciling client names from monday.com or ad platforms. Multiple matches return a disambiguation list.',
  parameters: params,
  requiredPermission: 'CLIENTS',
  handler: (a, c) => getClientOverview(a, c),
}
