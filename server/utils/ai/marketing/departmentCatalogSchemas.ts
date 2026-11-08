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
const clause = z.strictObject({ field: z.enum(['make', 'model', 'year', 'condition', 'body_style', 'fuel_type', 'transmission', 'custom_label_0']), operator: z.enum(['eq', 'is_any', 'gt', 'lt']), value: z.union([z.string().trim().min(1).max(160), z.number().finite(), z.array(z.string().trim().min(1).max(160)).min(1).max(30)]) })
export const departmentProductFilter = z.strictObject({ clauses: z.array(clause).min(1).max(20) })
export function metaProductFilter(input: z.infer<typeof departmentProductFilter>): Record<string, unknown> {
  return { and: input.clauses.map(c => ({ [c.field]: { [c.operator]: c.value } })) }
}
const catalogCreation = bound.omit({ catalogId: true }).extend({ name: z.string().trim().min(1).max(120) })
const proposal = z.strictObject({ clientId: z.string().uuid(), proposalId: z.string().uuid() })
export const departmentCatalogContracts = [
  ['marketing_list_catalog_connections', z.strictObject({ clientId: z.string().uuid() }), false, 'List the exact client active Meta connection IDs and saved catalogue/source/product feed identifiers without credentials.'],
  ['marketing_find_client_catalogs', bound.omit({ catalogId: true }).extend({ cursor: z.number().int().min(0).max(100000).optional(), limit: z.number().int().min(1).max(10).optional() }), false, 'Discover only exact client-owned catalogue IDs from persisted bindings or a sole canonical source feed URL; inspect at most ten business candidates per cursor.'],
  ['marketing_diagnose_catalog', bound, false, 'Inspect exact client-bound catalogue type and safe import evidence, including commerce versus vehicles mismatch.'],
  ['marketing_get_catalog_upload_status', bound, false, 'Read the current bound feed upload status and numeric error evidence; processing is not provider acceptance.'],
  ['marketing_propose_vehicle_catalog', catalogCreation, true, 'Review creation of a Vehicles catalogue in the exact client connection business and attachment of its seller-scoped source feed.'],
  ['marketing_propose_product_set', bound.extend({ name: z.string().trim().min(1).max(120), filter: departmentProductFilter }), true, 'Review creation of a new product set, including custom_label_0 new/demo rules.'],
  ['marketing_propose_catalog_refresh', bound, true, 'Review an upload refresh of the currently bound feed without changing its schedule or source.'],
  ['marketing_get_catalog', bound, false, 'Read an exact client-bound Meta vehicle catalog, feed receipt and product sets using its current connection.'],
  ['marketing_preview_product_set', bound.extend({ productSetId: id }), false, 'Read a product set only after proving membership in this exact client-bound catalog.'],
  ['marketing_get_catalog_change', proposal, false, 'Read the durable catalog proposal and retained provider receipts.'],
  ['marketing_propose_catalog_feed', bound, true, 'Prepare an exact seller-scoped feed mapping to a current connection-owned vehicle catalog; initial mapping requires an empty catalogue or an exact client serve URL match and independent approval.'],
  ['marketing_propose_product_set_change', bound.extend({ productSetId: id, filter: departmentProductFilter }), true, 'Prepare bounded product-set rules against an exact catalog, connection and seller-scoped source.'],
  ['marketing_approve_catalog_change', proposal.extend({ expectedRevision: z.string().regex(/^[a-f0-9]{64}$/), ack: z.literal(true) }), true, 'Independently approve the exact catalog/source mapping or product-set change after current provider ownership checks.'],
  ['marketing_execute_catalog_change', proposal.extend({ expectedRevision: z.string().regex(/^[a-f0-9]{64}$/), ack: z.literal(true) }), true, 'Execute this actor’s exact acknowledged catalog proposal once; retain partial or unknown provider outcomes.']
] as const
