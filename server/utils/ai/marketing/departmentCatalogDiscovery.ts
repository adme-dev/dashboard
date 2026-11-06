import { queryRowsFresh } from '~~/server/utils/db'
import { listMetaCatalogFeedBindings } from '~~/server/utils/metaCatalogRepository'
import type { MetaCatalogProvider, MetaCatalogSummary, MetaCatalogFeedBindingSummary } from '~~/server/utils/metaCatalogPlatform'
import type { DealerLink } from '~~/server/utils/feeds/types'

const numericId = /^\d{5,30}$/
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i
const isId = (value: unknown, pattern: RegExp): value is string => typeof value === 'string' && pattern.test(value)

/** Caller must first enforce fresh department and client admission. Never select secrets or metadata. */
export async function listCatalogConnections(clientId: string) {
  const rows = await queryRowsFresh<{ id: string, account_id: string }>(`SELECT id,account_id FROM social_connections
    WHERE client_id=$1 AND platform='meta' AND status='active' ORDER BY id LIMIT 51`, [clientId])
  const connections = []
  for (const row of rows.slice(0, 50)) {
    if (!isId(row.id, uuid)) continue
    const accountId = typeof row.account_id === 'string' ? row.account_id.replace(/^act_/, '') : ''
    const bindings = await listMetaCatalogFeedBindings(clientId, row.id, { queryRows: queryRowsFresh })
    connections.push({ connectionId: row.id,
      ...(numericId.test(accountId) ? { accountId, actId: `act_${accountId}` } : {}),
      bindings: bindings.slice(0, 100).filter(b => isId(b.catalogId, numericId) && isId(b.sourceFeedId, uuid) && isId(b.productFeedId, numericId))
        .map(b => ({ catalogId: b.catalogId, sourceFeedId: b.sourceFeedId, productFeedId: b.productFeedId })),
      bindingsTruncated: bindings.length > 100 })
  }
  return { clientId, connections, truncated: rows.length > 50 }
}

interface DiscoveryScope {
  catalogs: MetaCatalogSummary[]
  bindings: MetaCatalogFeedBindingSummary[]
  provider: MetaCatalogProvider
  link: DealerLink
  baseUrl: string
}
/** Scope comes from the same current source/connection/business validation used for reviewed catalogue repair. */
export async function findClientCatalogs(input: { clientId: string, connectionId: string, sourceFeedId: string, cursor?: number, limit?: number }, scope: DiscoveryScope) {
  const cursor = input.cursor ?? 0
  const limit = input.limit ?? 10
  const candidates = [...scope.catalogs].sort((a, b) => a.id.localeCompare(b.id))
  const page = candidates.slice(cursor, cursor + limit)
  const expectedUrl = `${scope.baseUrl.replace(/\/+$/, '')}/api/feeds/${encodeURIComponent(input.sourceFeedId)}/serve`
  const catalogs = []
  let partial = false
  for (const candidate of page) {
    if (!isId(candidate.id, numericId)) continue
    try {
      const conflicts = await queryRowsFresh(`SELECT client_id FROM meta_catalog_feed_bindings
        WHERE product_catalog_id=$1 AND client_id<>$2 LIMIT 1`, [candidate.id, input.clientId])
      if (conflicts.length) continue
      const feeds = await scope.provider.listProductFeeds(candidate.id)
      const binding = scope.bindings.find(b => b.catalogId === candidate.id && b.sourceFeedId === input.sourceFeedId)
      const feed = binding
        ? feeds.find(f => f.id === binding.productFeedId)
        : scope.link.defaultFeedIds?.includes(input.sourceFeedId) && feeds.length === 1 && feeds[0]?.schedule?.url === expectedUrl ? feeds[0] : null
      if (!feed || !isId(feed.id, numericId)) continue
      const vertical = candidate.vertical?.toUpperCase()
      catalogs.push({ catalogId: candidate.id, catalogType: vertical === 'VEHICLES' ? 'VEHICLES' : vertical === 'COMMERCE' ? 'COMMERCE' : 'OTHER',
        productFeedId: feed.id, persistedBinding: !!binding })
    } catch {
      // No provider errors, candidate identities, names or unproven ownership details leave this boundary.
      partial = true
    }
  }
  return { clientId: input.clientId, connectionId: input.connectionId, sourceFeedId: input.sourceFeedId, catalogs,
    nextCursor: cursor + page.length < candidates.length ? cursor + page.length : null, partial }
}
