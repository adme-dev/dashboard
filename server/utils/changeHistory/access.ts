/**
 * Authorised entry point for the per-client change timeline. Both the agency API route and the
 * read-only MCP/chat tool go through here so the client scope rule is identical:
 *  - owner (verified God mode) and management: any client;
 *  - other staff: only clients they currently cover (fresh assignment scope), and only with the
 *    client-reading family (CLIENTS, CREATIVE, MEDIA_BUYING, management, or the MCP `reporting` grant).
 * An out-of-scope client is indistinguishable from a missing one (404).
 */
import { createError } from 'h3'
import { queryOneFresh, queryRowsFresh } from '~~/server/utils/db'
import { clientScopeSql, requireMarketingReadPermission, requireScopedClient, type MarketingReadScope } from '~~/server/utils/ai/marketing/readScope'
import { escapeLike } from '~~/server/utils/ai/toolContext'
import { getClientChangeHistory, type ChangeHistoryDeps, type ClientChangeHistoryPage, type ClientChangeHistoryQuery } from './clientTimeline'

export interface ScopedChangeHistoryDeps {
  requireClient: (scope: MarketingReadScope, clientId: string) => Promise<void>
  clientName: (clientId: string) => Promise<string | null>
  history: (query: ClientChangeHistoryQuery, deps?: ChangeHistoryDeps) => Promise<ClientChangeHistoryPage>
}

const defaultDeps: ScopedChangeHistoryDeps = {
  requireClient: requireScopedClient,
  clientName: async clientId => (await queryOneFresh<{ name: string }>('SELECT name FROM agency_clients WHERE id = $1', [clientId]))?.name ?? null,
  history: getClientChangeHistory
}

export async function readScopedClientChangeHistory(
  scope: MarketingReadScope,
  query: ClientChangeHistoryQuery,
  deps: ScopedChangeHistoryDeps = defaultDeps
): Promise<ClientChangeHistoryPage & { client: { id: string, name: string | null } }> {
  requireMarketingReadPermission(scope, 'clients')
  await deps.requireClient(scope, query.clientId)
  const [page, name] = await Promise.all([deps.history(query), deps.clientName(query.clientId)])
  return { client: { id: query.clientId, name }, ...page }
}

/** Name → client id, searched ONLY inside the caller's client scope (never leaks other clients). */
export async function resolveScopedClientByName(scope: MarketingReadScope, name: string): Promise<{ id: string, name: string } | null> {
  const params: unknown[] = [`%${escapeLike(name)}%`, name]
  const predicate = clientScopeSql(scope, 'c.id', params)
  if (predicate === 'FALSE') return null
  const rows = await queryRowsFresh<{ id: string, name: string }>(
    `SELECT c.id, c.name FROM agency_clients c
      WHERE c.name ILIKE $1 AND ${predicate}
      ORDER BY (lower(c.name) = lower($2)) DESC, c.is_active DESC, c.name ASC
      LIMIT 2`,
    params
  )
  if (rows.length > 1 && rows[0]!.name.toLowerCase() !== name.toLowerCase()) {
    throw createError({ statusCode: 409, statusMessage: `"${name}" matches more than one client; pass clientId.` })
  }
  return rows[0] ?? null
}
