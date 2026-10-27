import { createError } from 'h3'
import { queryRowsFresh, queryOneFresh } from '~~/server/utils/db'
import { escapeLike } from '../toolContext'
import { clientScopeSql, requireMarketingReadPermission, requireScopedClient, type MarketingReadScope } from './readScope'
import type { LeadCount } from '../tools/leads'

export type ClientMatch = { id: string; name: string; is_active?: boolean; aliases?: string[]; billing_type?: string | null; parent_client_id?: string | null; parent_client_name?: string | null }
export async function findScopedClients(scope: MarketingReadScope, name: string, limit = 25, exact = false): Promise<ClientMatch[]> {
  requireMarketingReadPermission(scope, 'clients')
  const values: unknown[] = [exact ? escapeLike(name) : `%${escapeLike(name)}%`]
  const predicate = clientScopeSql(scope, 'c.id', values)
  const parentPredicate = clientScopeSql(scope, 'parent.id', values)
  values.push(Math.min(Math.max(limit, 1), 25) + 1)
  return queryRowsFresh<ClientMatch>(`SELECT c.id, c.name, c.is_active,
    ${scope.financialReadAllowed ? 'c.billing_type,' : ''}
    parent.id AS parent_client_id, parent.name AS parent_client_name,
    ARRAY(SELECT a.alias FROM agency_client_aliases a WHERE a.client_id = c.id ORDER BY a.alias) AS aliases
    FROM agency_clients c LEFT JOIN agency_clients parent ON parent.id = c.parent_client_id AND ${parentPredicate}
    WHERE ${predicate} AND (c.name ILIKE $1 OR EXISTS (SELECT 1 FROM agency_client_aliases a WHERE a.client_id = c.id AND a.alias ILIKE $1))
    ORDER BY c.name, c.id LIMIT $${values.length}`, values)
}
export async function resolveScopedClient(scope: MarketingReadScope, name: string): Promise<ClientMatch | null> {
  const exact = await findScopedClients(scope, name, 1, true)
  const rows = exact.length ? exact : await findScopedClients(scope, name, 1)
  if (rows.length > 1) throw createError({ statusCode: 400, statusMessage: 'Multiple clients match; narrow the client name' })
  return rows[0] ?? null
}
export async function readBriefCount(scope: MarketingReadScope, clientId: string): Promise<number> {
  requireMarketingReadPermission(scope, 'clients')
  await requireScopedClient(scope, clientId)
  const values: unknown[] = [clientId]
  const predicate = clientScopeSql(scope, 'b.client_id', values)
  const row = await queryOneFresh(`SELECT COUNT(*) AS total FROM briefs b WHERE b.client_id = $1 AND ${predicate}`, values)
  return Number(row?.total) || 0
}
export async function readMarginSnapshot(scope: MarketingReadScope, clientId: string) {
  requireMarketingReadPermission(scope, 'clients')
  if (!scope.financialReadAllowed) return undefined
  await requireScopedClient(scope, clientId)
  const values: unknown[] = [clientId]
  const predicate = clientScopeSql(scope, 'p.client_id', values)
  const r = await queryOneFresh(
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
     WHERE p.client_id = $1 AND ${predicate}`,
    values,
  )
  // No projects → no profitability basis; surface null rather than a misleading 0%.
  if (!r || Number(r.project_count) === 0) return null
  const totalRevenue = Number(r.total_revenue) || 0
  const grossProfit = Number(r.gross_profit) || 0
  const grossMargin = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0
  return { totalRevenue, grossProfit, grossMargin }
}
export async function readClientOverview(scope: MarketingReadScope, clientId: string) {
  requireMarketingReadPermission(scope, 'clients')
  await requireScopedClient(scope, clientId)
  const values: unknown[] = [clientId]
  const predicate = clientScopeSql(scope, 'c.id', values)
  const parentPredicate = clientScopeSql(scope, 'parent.id', values)
  const row = await queryOneFresh<ClientMatch>(`SELECT c.id, c.name, c.is_active, ${scope.financialReadAllowed ? 'c.billing_type,' : ''}
    parent.id AS parent_client_id, parent.name AS parent_client_name,
    ARRAY(SELECT a.alias FROM agency_client_aliases a WHERE a.client_id = c.id ORDER BY a.alias) AS aliases
    FROM agency_clients c LEFT JOIN agency_clients parent ON parent.id = c.parent_client_id AND ${parentPredicate}
    WHERE c.id = $1 AND ${predicate}`, values)
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Client not found' })
  return { clientId: row.id, name: row.name, alternateNames: row.aliases ?? [], active: row.is_active,
    parentClient: row.parent_client_id ? { id: row.parent_client_id, name: row.parent_client_name } : null,
    briefCount: await readBriefCount(scope, clientId),
    ...(scope.financialReadAllowed ? { billingType: row.billing_type, marginSnapshot: await readMarginSnapshot(scope, clientId) } : {}) }
}
export async function readLeadSummary(scope: MarketingReadScope, query: { clientId: string; fromISO: string; status?: string; source?: string }): Promise<LeadCount[]> {
  requireMarketingReadPermission(scope, 'lead_summary')
  await requireScopedClient(scope, query.clientId)
  const values: unknown[] = [query.clientId, query.fromISO]
  const conditions = ['l.client_id = $1', 'l.submitted_at >= $2', 'l.deleted_at IS NULL', 'l.is_test = false', clientScopeSql(scope, 'l.client_id', values)]
  for (const key of ['status', 'source'] as const) if (query[key]) { values.push(query[key]); conditions.push(`l.${key} = $${values.length}`) }
  return queryRowsFresh<LeadCount>(`SELECT l.status, l.source, COUNT(DISTINCT l.id)::int AS count FROM leads l WHERE ${conditions.join(' AND ')} GROUP BY l.status, l.source`, values)
}

/** Owner substring search is a filter inside the already-authorized relation, never an ACL. */
export function ownerClientNameSql(scope: MarketingReadScope, name: string | undefined, column: 'ms.client_id' | 'l.client_id', values: unknown[]): string | null {
  if (!scope.ownerVerified || !name) return null
  values.push(`%${escapeLike(name)}%`)
  const parameter = `$${values.length}`
  return `EXISTS (SELECT 1 FROM agency_clients named_client WHERE named_client.id = ${column}
    AND (named_client.name ILIKE ${parameter} OR EXISTS (SELECT 1 FROM agency_client_aliases named_alias
      WHERE named_alias.client_id = named_client.id AND named_alias.alias ILIKE ${parameter})))`
}
