import type { ToolContext } from '~~/server/utils/ai/toolContext'
import { queryRows } from '~~/server/utils/db'
import { proposeAction } from '~~/server/utils/ai/pendingActions'
import { getDealerLink, linkToContext } from '~~/server/utils/feeds/dealerLinks'
import { getSocialDashboardClient, resolveSocialDashboardBaseUrl } from '~~/server/utils/feeds/config'
import { getFeedProvider } from '~~/server/utils/feeds/registry'
import type { DealerLink, FeedProvider, FeedSummary, VehicleSummary } from '~~/server/utils/feeds/types'
import { createMetaCatalogProvider } from '~~/server/utils/metaCatalogProvider'
import type { MetaCatalogProvider, MetaProductFeedSummary } from '~~/server/utils/metaCatalogPlatform'
import { attachMetaCatalogFeedForClient } from '~~/server/utils/metaCatalogApplication'
import { getMetaCatalogConnectionAuthority, type MetaCatalogConnectionRecord } from '~~/server/utils/metaCatalogRepository'
import {
  evaluateProductSetFilter,
  meetsMinimum,
  shapeByCondition,
  summarizeProductSetFilter,
  type AttachArgs,
  type AttachPreview,
  type FeedAttachPendingPayload,
  type FeedConfirmAction,
  type FeedSetRulesPendingPayload,
  type RefreshArgs,
  type SetRulesArgs,
  type SetRulesPreview
} from './feedTools'

/**
 * MCP Inventory Feed Round — the REAL runner (the binding-dependent half of feedTools.ts). Reads the
 * same dealer-link / social-dashboard provider path the admin dealer-feed endpoints use, and the same
 * Meta catalog provider ensureMetaCatalogFeed writes through. No new HTTP routes: application and
 * provider functions are called directly.
 */

const FEED_PREVIEW_LIMIT = 500

interface ClientBindingRow {
  connection_id: string
  source_feed_id: string
  product_catalog_id: string
  product_feed_id: string
  state: string
  last_verified_at: string | null
}

async function listBindingsForClient(clientId: string): Promise<ClientBindingRow[]> {
  return await queryRows<ClientBindingRow>(
    `SELECT connection_id::text, source_feed_id::text, product_catalog_id, product_feed_id,
            state, last_verified_at::text
       FROM meta_catalog_feed_bindings
      WHERE client_id = $1
      ORDER BY created_at ASC`,
    [clientId]
  )
}

async function loadDealerContext(clientId: string, ctx: ToolContext): Promise<{
  link: DealerLink
  provider: FeedProvider
  providerContext: ReturnType<typeof linkToContext>
}> {
  const link = await getDealerLink(clientId)
  if (!link) throw new Error('No dealer feed link exists for this client')
  const client = await getSocialDashboardClient({})
  if (!client) throw new Error('Dealer feed provider is not configured')
  const provider = getFeedProvider(link.providerId, { socialDashboardClient: client })
  const providerContext = linkToContext(link, ctx.userEmail ?? 'mcp@xeroflow')
  return { link, provider, providerContext }
}

async function loadServedItems(
  clientId: string,
  sourceFeedId: string,
  ctx: ToolContext
): Promise<{ total: number, items: VehicleSummary[], feedName: string | null }> {
  const { link, provider, providerContext } = await loadDealerContext(clientId, ctx)
  const feeds = await provider.listFeeds(providerContext, link)
  const feed = feeds.find(candidate => candidate.id === sourceFeedId) ?? null
  const preview = await provider.previewFeed(
    providerContext,
    link,
    { providerId: link.providerId, feedId: sourceFeedId, platform: feed?.platform ?? 'facebook' },
    { limit: FEED_PREVIEW_LIMIT }
  )
  return { total: preview.total, items: preview.items, feedName: feed?.name ?? null }
}

async function connectionAuthority(clientId: string, connectionId: string): Promise<MetaCatalogConnectionRecord> {
  const connection = await getMetaCatalogConnectionAuthority(clientId, connectionId)
  if (!connection || !connection.accessToken) throw new Error('Active mapped Meta connection not found')
  return connection
}

function metaProvider(connection: MetaCatalogConnectionRecord): MetaCatalogProvider {
  return createMetaCatalogProvider({ accessToken: connection.accessToken })
}

function buildServeUrl(baseUrl: string, sourceFeedId: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/api/feeds/${encodeURIComponent(sourceFeedId)}/serve`
}

function scheduleUrl(feed: MetaProductFeedSummary | null | undefined): string | null {
  const url = feed?.schedule && typeof feed.schedule === 'object' ? (feed.schedule as Record<string, unknown>).url : null
  return typeof url === 'string' && url.trim() ? url.trim() : null
}

function latestUpload(feed: MetaProductFeedSummary | null | undefined): { id: string | null, status: string | null, endTime: string | null } {
  const upload = feed?.latest_upload && typeof feed.latest_upload === 'object'
    ? feed.latest_upload as Record<string, unknown>
    : {}
  return {
    id: typeof upload.id === 'string' ? upload.id : null,
    status: typeof upload.status === 'string' ? upload.status : null,
    endTime: typeof upload.end_time === 'string' ? upload.end_time : null
  }
}

async function shapedProductSets(provider: MetaCatalogProvider, catalogId: string) {
  const sets = await provider.listProductSets(catalogId)
  return sets.map(set => ({
    productSetId: set.id,
    name: set.name,
    filterSummary: summarizeProductSetFilter(set.filter),
    itemCount: set.product_count ?? null,
    meetsMinimum: meetsMinimum(set.product_count),
    // Meta's Graph API exposes no reverse product-set → campaign edge; this stays empty until a
    // local campaign→product-set mapping exists. Never fabricated.
    linkedCampaignIds: [] as string[]
  }))
}

export function buildFeedReadRunner() {
  return {
    get_inventory_feed_health: async (raw: unknown, ctx: ToolContext) => {
      const { clientId } = raw as { clientId: string }
      const link = await getDealerLink(clientId)
      if (!link) return { clientId, dataStatus: 'no_dealer_link' as const }

      const bindings = await listBindingsForClient(clientId)
      const baseUrl = await resolveSocialDashboardBaseUrl({})

      const results = []
      for (const binding of bindings) {
        const serveUrl = buildServeUrl(baseUrl, binding.source_feed_id)
        const served = await loadServedItems(clientId, binding.source_feed_id, ctx)
          .catch((error: unknown) => ({ total: null, items: [] as VehicleSummary[], feedName: null, error: error instanceof Error ? error.message : 'served feed unavailable' }))

        let catalog: Record<string, unknown> = { catalogId: binding.product_catalog_id, productFeedId: binding.product_feed_id }
        let productSets: unknown[] = []
        try {
          const connection = await connectionAuthority(clientId, binding.connection_id)
          const provider = metaProvider(connection)
          const readback = await provider.getProductFeed(binding.product_feed_id)
          const upload = latestUpload(readback)
          catalog = {
            catalogId: binding.product_catalog_id,
            productFeedId: binding.product_feed_id,
            scheduleUrl: scheduleUrl(readback),
            scheduleMatchesXeroFlow: scheduleUrl(readback) === serveUrl,
            lastUploadId: upload.id,
            lastUploadStatus: upload.status,
            lastUploadAt: upload.endTime
          }
          productSets = await shapedProductSets(provider, binding.product_catalog_id)
        } catch (error) {
          catalog = { ...catalog, error: error instanceof Error ? error.message : 'Meta catalog readback unavailable' }
        }

        results.push({
          dealerLinkId: link.clientId,
          providerId: link.providerId,
          feedId: binding.source_feed_id,
          feedName: served.feedName,
          serveUrl,
          itemCount: served.total,
          byCondition: shapeByCondition(served.items),
          ...('error' in served && served.error ? { servedFeedError: served.error } : {}),
          catalog,
          productSets,
          bindingState: binding.state,
          lastVerifiedAt: binding.last_verified_at
        })
      }

      return {
        clientId,
        dealerLinkId: link.clientId,
        providerId: link.providerId,
        dataStatus: bindings.length ? 'bound' as const : 'no_catalog_binding' as const,
        lastSyncedAt: new Date().toISOString(),
        feeds: results
      }
    },

    list_product_sets: async (raw: unknown, ctx: ToolContext) => {
      const { clientId, catalogId } = raw as { clientId: string, catalogId: string }
      const bindings = await listBindingsForClient(clientId)
      const binding = bindings.find(candidate => candidate.product_catalog_id === catalogId) ?? bindings[0]
      if (!binding) throw new Error('No Meta catalog binding exists for this client')
      const connection = await connectionAuthority(clientId, binding.connection_id)
      void ctx
      return await shapedProductSets(metaProvider(connection), catalogId)
    }
  }
}

async function resolveAttachPreview(args: Omit<AttachArgs, 'dryRun'>, ctx: ToolContext): Promise<AttachPreview> {
  const connection = await connectionAuthority(args.clientId, args.connectionId)
  const provider = metaProvider(connection)
  const { link, provider: feedProvider, providerContext } = await loadDealerContext(args.clientId, ctx)

  const sourceFeeds = await feedProvider.listFeeds(providerContext, link)
  const sourceFeed = sourceFeeds.find((feed: FeedSummary) => feed.id === args.sourceFeedId && feed.platform === 'facebook' && feed.isActive)
  if (!sourceFeed) throw new Error('Source feed is not linked to this client')

  const baseUrl = await resolveSocialDashboardBaseUrl({})
  const proposedScheduleUrl = buildServeUrl(baseUrl, args.sourceFeedId)

  const business = await provider.getAdAccountBusiness(connection.actId)
  if (!business) throw new Error('Meta business is not accessible through this connection')
  const catalogs = await provider.listBusinessCatalogs(business.id)
  const catalog = catalogs.find(candidate => candidate.id === args.catalogId) ?? null
  if (!catalog || String(catalog.vertical ?? '').trim().toUpperCase() !== 'VEHICLES') {
    throw new Error('vehicle catalogue is not accessible through this connection')
  }

  const feeds = await provider.listProductFeeds(args.catalogId)
  const existing = feeds.find(feed => scheduleUrl(feed) === proposedScheduleUrl) ?? null

  const served = await loadServedItems(args.clientId, args.sourceFeedId, ctx).catch(() => null)

  return {
    catalogId: args.catalogId,
    catalogName: catalog.name ?? null,
    sourceFeedId: args.sourceFeedId,
    sourceFeedName: sourceFeed.name ?? null,
    proposedScheduleUrl,
    currentScheduleUrl: existing ? scheduleUrl(existing) : null,
    feedDisposition: existing ? 'reused' : 'created',
    existingProductFeedId: existing?.id ?? null,
    itemCount: served?.total ?? null
  }
}

async function resolveSetRulesPreview(args: Omit<SetRulesArgs, 'dryRun'>, ctx: ToolContext): Promise<SetRulesPreview> {
  const connection = await connectionAuthority(args.clientId, args.connectionId)
  const provider = metaProvider(connection)
  const current = await provider.getProductSet(args.productSetId)

  const bindings = await listBindingsForClient(args.clientId)
  const binding = bindings.find(candidate => candidate.connection_id === args.connectionId) ?? bindings[0]
  if (!binding) throw new Error('No Meta catalog binding exists for this client; cannot preview against the served feed')
  const served = await loadServedItems(args.clientId, binding.source_feed_id, ctx)
  const proposedItemCount = evaluateProductSetFilter(args.filter, served.items)

  return {
    productSetId: args.productSetId,
    productSetName: current.name ?? null,
    currentFilterSummary: summarizeProductSetFilter(current.filter),
    currentItemCount: current.product_count ?? null,
    proposedFilter: args.filter,
    proposedFilterSummary: summarizeProductSetFilter(JSON.stringify(args.filter)),
    proposedItemCount
  }
}

async function refresh(args: RefreshArgs, _ctx: ToolContext) {
  const connection = await connectionAuthority(args.clientId, args.connectionId)
  const provider = metaProvider(connection)
  const before = await provider.getProductFeed(args.productFeedId)
  const serveUrl = scheduleUrl(before)
  if (!serveUrl) throw new Error('Product feed has no scheduled fetch URL; attach it before refreshing')

  if (args.dryRun) {
    return {
      dryRun: true as const,
      productFeedId: args.productFeedId,
      serveUrl,
      uploadId: null,
      itemCount: null,
      lastUploadStatus: latestUpload(before).status
    }
  }

  const upload = await provider.createProductFeedUpload(args.productFeedId, serveUrl)
  const readback = await provider.getProductFeed(args.productFeedId)
  const settled = latestUpload(readback)
  return {
    productFeedId: args.productFeedId,
    serveUrl,
    uploadId: upload.id || settled.id,
    itemCount: null as number | null,
    lastUploadStatus: settled.status
  }
}

export function buildFeedProposeDeps() {
  return {
    resolveAttachPreview,
    resolveSetRulesPreview,
    refresh,
    persist: (ctx: ToolContext, action: FeedConfirmAction, payload: unknown) => proposeAction(ctx, null, action, payload)
  }
}

export function buildFeedConfirmDeps() {
  return {
    executeAttach: async (payload: FeedAttachPendingPayload, ctx: ToolContext) => {
      // ensureMetaCatalogFeed (via attachMetaCatalogFeedForClient) re-runs the allowedSourceFeedIds
      // guard, permission check, vehicle-catalog check, and the schedule-URL readback (P-3).
      return await attachMetaCatalogFeedForClient({
        clientId: payload.args.clientId,
        connectionId: payload.args.connectionId,
        catalogId: payload.args.catalogId,
        sourceFeedId: payload.args.sourceFeedId,
        actorId: ctx.userId,
        actorEmail: ctx.userEmail ?? 'mcp@xeroflow'
      })
    },
    applySetRules: async (payload: FeedSetRulesPendingPayload, _ctx: ToolContext) => {
      const connection = await connectionAuthority(payload.args.clientId, payload.args.connectionId)
      const provider = metaProvider(connection)
      await provider.updateProductSet(payload.args.productSetId, { filter: payload.args.filter })
      // P-3 readback: the post-state filter must match the intent before we report success.
      const readback = await provider.getProductSet(payload.args.productSetId)
      let readbackFilter: unknown = null
      try {
        readbackFilter = readback.filter ? JSON.parse(readback.filter) : null
      } catch {
        readbackFilter = readback.filter
      }
      if (JSON.stringify(readbackFilter) !== JSON.stringify(payload.args.filter)) {
        throw new Error('Meta product set readback did not match the proposed filter')
      }
      return {
        productSetId: payload.args.productSetId,
        appliedFilter: payload.args.filter,
        itemCount: readback.product_count ?? null,
        meetsMinimum: meetsMinimum(readback.product_count),
        readbackVerified: true as const
      }
    }
  }
}
