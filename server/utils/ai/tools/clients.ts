import { z } from 'zod'
import { resolveMarketingReadScope } from '../marketing/readScope'
import { findScopedClients, readBriefCount, readMarginSnapshot } from '../marketing/clientReads'
import type { AiTool } from '../toolRegistry'
import { ok, fail, type ToolContext, type ToolResult } from '../toolContext'
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
  marginSnapshot: (clientId: string, ctx: ToolContext) => Promise<MarginSnapshot | undefined>
}

// Real wiring against Postgres. Columns verified against
// server/api/agency/clients/{index.get,[id].get}.ts: agency_clients has
// id/name/is_active/billing_type; briefs carries client_id; profitability is
// derived from projects + time_entries + project_expenses (same shape as the
// list endpoint's `stats` subquery), so the snapshot mirrors that calculation.
const defaultDeps: ClientsDeps = {
  findClients: async (name, ctx) => findScopedClients(await resolveMarketingReadScope(ctx), name, CLIENT_MATCH_CAP) as Promise<ClientRow[]>,
  briefCount: async (id, ctx) => readBriefCount(await resolveMarketingReadScope(ctx), id),
  marginSnapshot: async (id, ctx) => readMarginSnapshot(await resolveMarketingReadScope(ctx), id),
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
      ...(marginSnapshot !== undefined ? { billingType: c.billing_type, marginSnapshot } : {}),
      briefCount,
      ...buildDataHealth({ configured: true, expected: marginSnapshot === undefined ? 1 : 2, withData: marginSnapshot ? 2 : 1 }),
    })
  } catch {
    return fail('Could not load client overview — the client database may be unavailable.')
  }
}

export const clientOverviewTool: AiTool<Args> = {
  name: 'get_client_overview',
  description: 'Resolve a canonical or alternate client name and return the stable client ID, alternate names, parent dealer group, active status and brief count. Billing and profitability require independent finance authorization. Use this before reconciling client names from monday.com or ad platforms. Multiple matches return a disambiguation list.',
  parameters: params,
  requiredPermission: 'CLIENTS',
  handler: (a, c) => getClientOverview(a, c),
}
