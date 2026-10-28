import { z } from 'zod'
import type { DealerLink, FeedDetail } from '~~/server/utils/feeds/types'
/** Native source selectors and manual includes must not bypass the mapped seller predicate. */
export function isExactNativeFeedScope(feed: FeedDetail, link: DealerLink): boolean {
  if (!link.externalOrgId || !link.sellerRefs.length) return false
  if (feed.source && (feed.source.type !== 'meilisearch' || Object.keys(feed.source).some(k => k !== 'type'))) return false
  const f = feed.filters
  if (f.manualIncludeIds !== undefined || f.includeIds !== undefined || f.selectionMode !== undefined) return false
  const owned = (s: unknown) => typeof s === 'string' && link.sellerRefs.includes(s)
  if (Array.isArray(f.rulesets)) return f.rulesets.length > 0 && f.rulesets.every(r => r && typeof r === 'object' && owned(r.sellerId))
  const sellers = [...(Array.isArray(f.sellerIds) ? f.sellerIds : []), ...(Array.isArray(f.dealerIds) ? f.dealerIds : [])]
  return sellers.length > 0 && sellers.every(owned)
}
const id = z.string().regex(/^\d{5,30}$/)
const bound = z.strictObject({ clientId: z.string().uuid(), connectionId: z.string().uuid(), catalogId: id, sourceFeedId: z.string().uuid() })
const clause = z.strictObject({ field: z.enum(['make', 'model', 'year', 'condition', 'body_style', 'fuel_type', 'transmission']), operator: z.enum(['eq', 'is_any', 'gt', 'lt']), value: z.union([z.string().trim().min(1).max(160), z.number().finite(), z.array(z.string().trim().min(1).max(160)).min(1).max(30)]) })
export const departmentProductFilter = z.strictObject({ clauses: z.array(clause).min(1).max(20) })
export function metaProductFilter(input: z.infer<typeof departmentProductFilter>): Record<string, unknown> {
  return { and: input.clauses.map(c => ({ [c.field]: { [c.operator]: c.value } })) }
}
const proposal = z.strictObject({ clientId: z.string().uuid(), proposalId: z.string().uuid() })
export const departmentCatalogContracts = [
  ['marketing_get_catalog', bound, false, 'Read an exact client-bound Meta vehicle catalog, feed receipt and product sets using its current connection.'],
  ['marketing_preview_product_set', bound.extend({ productSetId: id }), false, 'Read a product set only after proving membership in this exact client-bound catalog.'],
  ['marketing_get_catalog_change', proposal, false, 'Read the durable catalog proposal and retained provider receipts.'],
  ['marketing_propose_catalog_feed', bound, true, 'Prepare an exact native feed mapping to a current connection-owned vehicle catalog; initial mapping requires an empty catalog and independent approval.'],
  ['marketing_propose_product_set_change', bound.extend({ productSetId: id, filter: departmentProductFilter }), true, 'Prepare bounded product-set rules against an exact catalog, connection and native seller-scoped source.'],
  ['marketing_approve_catalog_change', proposal.extend({ expectedRevision: z.string().regex(/^[a-f0-9]{64}$/), ack: z.literal(true) }), true, 'Independently approve the exact catalog/source mapping or product-set change after current provider ownership checks.'],
  ['marketing_execute_catalog_change', proposal.extend({ expectedRevision: z.string().regex(/^[a-f0-9]{64}$/), ack: z.literal(true) }), true, 'Execute this actor’s exact acknowledged catalog proposal once; retain partial or unknown provider outcomes.']
] as const
