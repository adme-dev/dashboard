import type { DealerLink, FeedDetail } from '~~/server/utils/feeds/types'

function supportedSupplier(source: Record<string, unknown>): boolean {
  if (source.type !== 'meilisearch') return ['adtorque', 'digitaldealer', 'inventory_api'].includes(String(source.type))
  try {
    const url = new URL(String(source.url))
    if (url.protocol !== 'https:' || url.username || url.password || url.port || url.search || url.hash) return false
    if (/^search\d*\.dealerstudio\.com\.au$/.test(url.hostname)) return url.pathname === '/multi-search'
    return url.hostname === 'search.imotor.com.au'
      && (url.pathname === '/multi-search' || /^\/indexes\/dealer_stock_\d+\/search$/.test(url.pathname))
  } catch { return false }
}

/**
 * Supplier settings are private, preconfigured authority, not caller input. A
 * saved supplier source is manageable only through the client's explicit feed
 * binding; sharing an organization alone never establishes ownership.
 */
export function isScopedDepartmentFeed(feed: FeedDetail, link: DealerLink): boolean {
  if (!link.externalOrgId || !link.sellerRefs.length) return false
  const filters = feed.filters
  if (!filters || filters.manualIncludeIds !== undefined || filters.includeIds !== undefined || filters.selectionMode !== undefined) return false
  const owns = (seller: unknown) => typeof seller === 'string' && link.sellerRefs.includes(seller)
  const sellers = [...(Array.isArray(filters.sellerIds) ? filters.sellerIds : []), ...(Array.isArray(filters.dealerIds) ? filters.dealerIds : [])]
  const scoped = Array.isArray(filters.rulesets)
    ? filters.rulesets.length > 0 && filters.rulesets.every(rule => rule && typeof rule === 'object' && owns(rule.sellerId))
    : sellers.length > 0 && sellers.every(owns)
  if (!scoped) return false
  const source = feed.source
  if (!source || (source.type === 'meilisearch' && Object.keys(source).every(key => key === 'type'))) return true
  return typeof feed.id === 'string'
    && link.defaultFeedIds?.includes(feed.id) === true
    && supportedSupplier(source)
}
