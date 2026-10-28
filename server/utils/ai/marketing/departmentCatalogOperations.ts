import { queryOneFresh, queryRowsFresh, transactionWithoutRetry } from '~~/server/utils/db'
import { getMetaCatalogConnectionAuthority, listMetaCatalogFeedBindings, persistMetaCatalogFeedEvidence } from '~~/server/utils/metaCatalogRepository'
import { createMetaCatalogProvider } from '~~/server/utils/metaCatalogProvider'
import { ensureMetaCatalogFeed } from '~~/server/utils/metaCatalogPlatform'
import { getDealerLink, linkToContext } from '~~/server/utils/feeds/dealerLinks'
import { getSocialDashboardClient, resolveSocialDashboardBaseUrl } from '~~/server/utils/feeds/config'
import { getFeedProvider } from '~~/server/utils/feeds/registry'
import { requireIndependentMarketingReviewer, assertMarketingCapabilityAtBoundary } from './reviewAuthority'
import { requireMarketingDepartment } from './departmentAuthority'
import { campaignDenied, requireDepartmentClient, departmentRuntimeEnv } from './departmentCampaignSupport'
import { departmentCatalogContracts, isExactNativeFeedScope, metaProductFilter, departmentProductFilter } from './departmentCatalogSchemas'
import { paidHash, preparePaidProposal, readPaidProposal, paidProposalView, claimPaidProposal, savePaidReceipt } from './departmentPaidProposals'
import { resolveMcpRuntimeConfig } from '../mcp/runtimeConfig'
import { fail, ok, type ToolContext, type ToolResult } from '../toolContext'

const ACTION = 'department_catalog_change'
interface Input { clientId: string, connectionId: string, catalogId: string, sourceFeedId: string, productSetId?: string, filter?: unknown, proposalId?: string, expectedRevision?: string }
async function loadCatalog(ctx: ToolContext, input: Input) {
  const connection = await getMetaCatalogConnectionAuthority(input.clientId, input.connectionId, { queryOne: queryOneFresh })
  if (!connection?.accessToken || (connection.tokenExpiresAt && !(Date.parse(connection.tokenExpiresAt) > Date.now()))) campaignDenied('not_ready')
  // A shared business's accessible catalog list is not client ownership evidence.
  const bindings = await listMetaCatalogFeedBindings(input.clientId, input.connectionId, { queryRows: queryRowsFresh })
  const binding = bindings.find(b => b.catalogId === input.catalogId && b.sourceFeedId === input.sourceFeedId) ?? null
  const conflicts = await queryRowsFresh(`SELECT client_id FROM meta_catalog_feed_bindings WHERE product_catalog_id=$1 AND client_id<>$2 LIMIT 1`, [input.catalogId, input.clientId])
  if (conflicts.length) campaignDenied('ownership_unproven')
  const link = await getDealerLink(input.clientId, undefined, { queryOne: queryOneFresh })
  if (!link) campaignDenied('not_ready')
  const env = departmentRuntimeEnv(ctx)
  if (env.DEALER_FEEDS_ENABLED !== 'true') campaignDenied('disabled')
  const client = await getSocialDashboardClient({ env, runtimeEnv: env, queryOne: queryOneFresh })
  if (!client) campaignDenied('not_ready')
  const feedProvider = getFeedProvider(link.providerId, { socialDashboardClient: client })
  const feedContext = linkToContext(link, ctx.userEmail ?? '')
  const list = await feedProvider.listFeeds(feedContext, link)
  if (!list.some(f => f.id === input.sourceFeedId && f.platform === 'facebook' && f.isActive)) campaignDenied('ownership_unproven')
  const feed = await feedProvider.getFeed(feedContext, { providerId: link.providerId, feedId: input.sourceFeedId, platform: 'facebook' })
  if (feed.id !== input.sourceFeedId || feed.platform !== 'facebook' || !feed.isActive || !isExactNativeFeedScope(feed, link)) campaignDenied('ownership_unproven')
  const provider = createMetaCatalogProvider({ accessToken: connection.accessToken })
  const permissions = await provider.listGrantedPermissions()
  if (!permissions.includes('catalog_management') || !permissions.includes('business_management')) campaignDenied('not_ready')
  const business = await provider.getAdAccountBusiness(connection.actId)
  if (!business) campaignDenied('ownership_unproven')
  const catalog = (await provider.listBusinessCatalogs(business.id)).find(c => c.id === input.catalogId && c.vertical?.toUpperCase() === 'VEHICLES')
  if (!catalog) campaignDenied('ownership_unproven')
  const feeds = await provider.listProductFeeds(input.catalogId)
  if (binding ? !feeds.some(f => f.id === binding.productFeedId) : feeds.length > 0) campaignDenied('ownership_unproven')
  const sets = await provider.listProductSets(input.catalogId)
  const set = input.productSetId ? sets.find(s => s.id === input.productSetId) : null
  if (input.productSetId && (!set || !binding)) campaignDenied('ownership_unproven')
  const baseUrl = await resolveSocialDashboardBaseUrl({ env, runtimeEnv: env, queryOne: queryOneFresh })
  const snapshot = { connectionId: connection.id, accountId: connection.accountId, actId: connection.actId, binding, link, feed, businessId: business.id, catalogId: catalog.id, feeds, set, baseUrl }
  return { connection, binding, link, feed, provider, sets, set, baseUrl, snapshot }
}
export async function runDepartmentCatalogOperation(name: string, raw: unknown, original: ToolContext, key?: string, digest?: string): Promise<ToolResult> {
  try {
    const contract = departmentCatalogContracts.find(c => c[0] === name)
    if (!contract) campaignDenied('not_found')
    const parsed = contract[1].safeParse(raw)
    if (!parsed.success) campaignDenied('bad_args')
    const input = parsed.data as Input
    let ctx = await requireMarketingDepartment(original, contract[2])
    const flags = resolveMcpRuntimeConfig(ctx.event)
    if (!flags.serverEnabled || !flags.suiteFlags.feeds || (contract[2] && !flags.suiteFlags.writes)) campaignDenied('disabled')
    await requireDepartmentClient(ctx, input.clientId)
    if (name === 'marketing_get_catalog_change') return ok(paidProposalView(await readPaidProposal(input.proposalId!, ACTION, input.clientId, undefined)))
    if (name === 'marketing_execute_catalog_change' || name === 'marketing_approve_catalog_change') {
      const p = await readPaidProposal(input.proposalId!, ACTION, input.clientId)
      if (p.resolved_payload.revision !== input.expectedRevision) campaignDenied('revision_conflict')
      if (p.status === 'executed') return p.result_payload?.complete === true ? ok(paidProposalView(p)) : fail('Catalog outcome held for reconciliation.', 'reconciliation_required')
      const intent = p.resolved_payload.input as unknown as Input
      const current = await loadCatalog(ctx, intent)
      if (paidHash({ action: ACTION, input: intent, snapshot: current.snapshot }) !== p.resolved_payload.revision) campaignDenied('revision_conflict')
      const requester = await assertMarketingCapabilityAtBoundary(ctx.event, p.user_id, input.clientId, 'department_management')
      if (!requester.permissionGroups?.includes('MARKETING_MANAGEMENT')) campaignDenied()
      if (name === 'marketing_approve_catalog_change') {
        await requireIndependentMarketingReviewer(ctx.event, { requesterId: p.user_id, reviewerId: ctx.userId, clientId: input.clientId })
        const review = { reviewerId: ctx.userId, approvedRevision: p.resolved_payload.revision }
        const approved = await transactionWithoutRetry(async db => (await db.query(`UPDATE ai_pending_actions SET result_payload=$2::jsonb
     WHERE id=$1 AND tool_name=$3 AND source='mcp' AND status='proposed' AND expires_at>NOW() AND resolved_payload=$4::jsonb AND result_payload IS NULL RETURNING id`, [p.id, JSON.stringify(review), ACTION, JSON.stringify(p.resolved_payload)])).rows[0])
        if (!approved) campaignDenied('revision_conflict')
        return ok({ proposalId: p.id, revision: p.resolved_payload.revision, approved: true })
      }
      // Only the requester executes their own independently approved proposal.
      if (ctx.userId !== p.user_id) campaignDenied('forbidden')
      const reviewerId = p.result_payload?.reviewerId
      if (typeof reviewerId !== 'string' || p.result_payload?.approvedRevision !== p.resolved_payload.revision) campaignDenied('approval_required')
      await requireIndependentMarketingReviewer(ctx.event, { requesterId: p.user_id, reviewerId, clientId: input.clientId })
      ctx = await requireMarketingDepartment(ctx, true)
      await requireDepartmentClient(ctx, input.clientId)
      const refreshedFlags = resolveMcpRuntimeConfig(ctx.event)
      if (!refreshedFlags.serverEnabled || !refreshedFlags.suiteFlags.feeds || !refreshedFlags.suiteFlags.writes) campaignDenied('disabled')
      await claimPaidProposal(p)
      const receipt: Record<string, unknown> = { complete: false, reviewerId, approvedRevision: p.resolved_payload.revision, catalogId: intent.catalogId, productFeedId: current.binding?.productFeedId ?? null }
      try {
        if (intent.productSetId) {
          const filter = metaProductFilter(departmentProductFilter.parse(intent.filter))
          receipt.productSetId = intent.productSetId
          await savePaidReceipt(p, receipt)
          await current.provider.updateProductSet(intent.productSetId, { filter })
          const readback = await current.provider.getProductSet(intent.productSetId)
          if (readback.id !== intent.productSetId || paidHash(JSON.parse(readback.filter ?? '{}')) !== paidHash(filter)) throw new Error('Readback mismatch')
          receipt.productCount = readback.product_count ?? null
        } else {
          await ensureMetaCatalogFeed({ connection: current.connection, clientId: intent.clientId, clientName: current.connection.clientName,
            catalogId: intent.catalogId, productFeedId: current.binding?.productFeedId, sourceFeedId: intent.sourceFeedId,
            sourceFeedName: current.feed.name, allowedSourceFeedIds: [intent.sourceFeedId], feedBaseUrl: current.baseUrl, actorId: ctx.userId }, {
            ...current.provider,
            createProductFeed: async (catalogId, spec) => {
              const r = await current.provider.createProductFeed(catalogId, spec)
              receipt.productFeedId = r.id
              await savePaidReceipt(p, receipt)
              return r
            },
            createProductFeedUpload: async (feedId, url) => {
              const r = await current.provider.createProductFeedUpload(feedId, url)
              receipt.uploadId = r.id
              await savePaidReceipt(p, receipt)
              return r
            }, persistEvidence: persistMetaCatalogFeedEvidence
          })
        }
        receipt.complete = true
        receipt.readbackVerified = true
        receipt.providerServingVerified = false
        await savePaidReceipt(p, receipt)
        return ok({ proposalId: p.id, revision: p.resolved_payload.revision, ...receipt })
      } catch { return fail('Catalog outcome held for reconciliation; retained receipts must be inspected before any further action.', 'reconciliation_required') }
    }
    const current = await loadCatalog(ctx, input)
    if (name.startsWith('marketing_propose_')) return ok(paidProposalView(await preparePaidProposal(ACTION, ctx.userId, input as unknown as Record<string, unknown>, current.snapshot, key!, digest!, 'mcp', { mapping: { clientId: input.clientId, connectionId: input.connectionId, catalogId: input.catalogId, sourceFeedId: input.sourceFeedId, sellerRefs: current.link.sellerRefs }, newMapping: !current.binding, currentProductCount: current.set?.product_count ?? null })))
    const view = (s: { id: string, product_count?: number | null }) => ({ productSetId: s.id, productCount: s.product_count ?? null })
    return ok({ clientId: input.clientId, connectionId: input.connectionId, catalogId: input.catalogId, sourceFeedId: input.sourceFeedId, productFeedId: current.binding?.productFeedId,
      productSets: (current.set ? [current.set] : current.sets).slice(0, 100).map(view), truncated: !current.set && current.sets.length > 100, providerServingVerified: false })
  } catch (error) {
    return fail('Catalog operation unavailable or resource ownership is unproven.', (error as { campaignCode?: string }).campaignCode ?? 'unavailable')
  }
}
