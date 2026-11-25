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

function isEmptyIdList(value: unknown): boolean {
  return value === undefined || (Array.isArray(value) && value.length === 0)
}

function isSafeSelectionMode(value: unknown): boolean {
  return value === undefined || value === 'filters'
}

export function isBareNativeFeedSource(source: Record<string, unknown> | null | undefined): boolean {
  return !source
    || ((source.type === 'meilisearch' || source.type === 'supabase')
      && Object.keys(source).every(key => key === 'type'))
}

function hasUnsafeFilterGroups(filters: Record<string, unknown>, owns: (seller: unknown) => boolean): boolean {
  if (filters.filterGroups === undefined) return false
  if (!Array.isArray(filters.filterGroups)) return true
  return filters.filterGroups.some((group) => {
    if (!group || typeof group !== 'object' || Array.isArray(group)) return true
    const g = group as Record<string, unknown>
    if (g.mode !== undefined && g.mode !== 'criteria') return true
    if (!isEmptyIdList(g.includeIds)) return true
    return !Array.isArray(g.sellerIds) || g.sellerIds.length === 0 || !g.sellerIds.every(owns)
  })
}

export function hasExactFeedSellerScope(feed: FeedDetail, link: DealerLink): boolean {
  if (!link.externalOrgId || !link.sellerRefs.length) return false
  const filters = feed.filters
  if (
    !filters
    || !isEmptyIdList(filters.manualIncludeIds)
    || !isEmptyIdList(filters.includeIds)
    || !isSafeSelectionMode(filters.selectionMode)
  ) return false
  const owns = (seller: unknown) => typeof seller === 'string' && link.sellerRefs.includes(seller)
  if (hasUnsafeFilterGroups(filters, owns)) return false
  const sellers = [...(Array.isArray(filters.sellerIds) ? filters.sellerIds : []), ...(Array.isArray(filters.dealerIds) ? filters.dealerIds : [])]
  if (sellers.some(seller => !owns(seller))) return false
  return Array.isArray(filters.rulesets)
    ? filters.rulesets.length > 0 && filters.rulesets.every(rule => rule && typeof rule === 'object' && owns(rule.sellerId))
    : sellers.length > 0
}

/**
 * Supplier settings are private, preconfigured authority, not caller input. A
 * saved supplier source is manageable only through the client's explicit feed
 * binding; sharing an organization alone never establishes ownership.
 */
export function isScopedDepartmentFeed(feed: FeedDetail, link: DealerLink): boolean {
  if (!hasExactFeedSellerScope(feed, link)) return false
  const source = feed.source
  if (isBareNativeFeedSource(source)) return true
  return typeof feed.id === 'string'
    && link.defaultFeedIds?.includes(feed.id) === true
    && supportedSupplier(source!)
}
