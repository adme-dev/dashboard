import { queryOneFresh, queryRowsFresh, transactionWithoutRetry } from '~~/server/utils/db'
import { getMetaCatalogConnectionAuthority, listMetaCatalogFeedBindings, persistMetaCatalogFeedEvidence } from '~~/server/utils/metaCatalogRepository'
import { createMetaCatalogProvider, MetaCatalogGraphError } from '~~/server/utils/metaCatalogProvider'
import { ensureMetaCatalogFeed } from '~~/server/utils/metaCatalogPlatform'
import { getDealerLink, linkToContext } from '~~/server/utils/feeds/dealerLinks'
import { getSocialDashboardClient, resolveSocialDashboardBaseUrl } from '~~/server/utils/feeds/config'
import { getFeedProvider } from '~~/server/utils/feeds/registry'
import { requireIndependentMarketingReviewer, assertMarketingCapabilityAtBoundary } from './reviewAuthority'
import { requireMarketingDepartment } from './departmentAuthority'
import { campaignDenied, requireDepartmentClient, departmentRuntimeEnv } from './departmentCampaignSupport'
import { departmentCatalogContracts, metaProductFilter, departmentProductFilter } from './departmentCatalogSchemas'
import { findClientCatalogs, listCatalogConnections } from './departmentCatalogDiscovery'
import { isScopedDepartmentFeed } from './departmentFeedOwnership'
import { paidHash, preparePaidProposal, readPaidProposal, paidProposalView, claimPaidProposal, savePaidReceipt } from './departmentPaidProposals'
import { resolveMcpRuntimeConfig } from '../mcp/runtimeConfig'
import { fail, ok, type ToolContext, type ToolResult } from '../toolContext'

const ACTION = 'department_catalog_change'
interface Input { clientId: string, connectionId: string, catalogId?: string, name?: string, operation?: 'create_catalog' | 'create_product_set' | 'refresh', sourceFeedId: string, productSetId?: string, filter?: unknown, proposalId?: string, expectedRevision?: string, cursor?: number, limit?: number }
async function loadCatalog(ctx: ToolContext, input: Input, diagnosis = false) {
  const connection = await getMetaCatalogConnectionAuthority(input.clientId, input.connectionId, { queryOne: queryOneFresh })
  if (!connection?.accessToken || (connection.tokenExpiresAt && !(Date.parse(connection.tokenExpiresAt) > Date.now()))) campaignDenied('not_ready')
  // A shared business's accessible catalog list is not client ownership evidence.
  const bindings = await listMetaCatalogFeedBindings(input.clientId, input.connectionId, { queryRows: queryRowsFresh })
  let binding = bindings.find(b => b.catalogId === input.catalogId && b.sourceFeedId === input.sourceFeedId) ?? null
  const conflicts = input.catalogId ? await queryRowsFresh(`SELECT client_id FROM meta_catalog_feed_bindings WHERE product_catalog_id=$1 AND client_id<>$2 LIMIT 1`, [input.catalogId, input.clientId]) : []
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
  if (feed.id !== input.sourceFeedId || feed.platform !== 'facebook' || !feed.isActive || !isScopedDepartmentFeed(feed, link)) campaignDenied('ownership_unproven')
  const provider = createMetaCatalogProvider({ accessToken: connection.accessToken })
  const permissions = await provider.listGrantedPermissions()
  if (!permissions.includes('catalog_management') || !permissions.includes('business_management')) campaignDenied('not_ready')
  const business = await provider.getAdAccountBusiness(connection.actId)
  if (!business) campaignDenied('ownership_unproven')
  const catalogs = await provider.listBusinessCatalogs(business.id)
  const catalog = input.catalogId ? catalogs.find(c => c.id === input.catalogId) : null
  if (input.catalogId && (!catalog || (!diagnosis && catalog.vertical?.toUpperCase() !== 'VEHICLES'))) campaignDenied('ownership_unproven')
  const baseUrl = await resolveSocialDashboardBaseUrl({ env, runtimeEnv: env, queryOne: queryOneFresh })
  const persistedBinding = !!binding
  const feeds = input.catalogId ? await provider.listProductFeeds(input.catalogId) : []
  if (!binding && feeds.length) {
    const expectedUrl = `${baseUrl.replace(/\/+$/, '')}/api/feeds/${encodeURIComponent(input.sourceFeedId)}/serve`
    const matches = feeds.filter(f => f.schedule?.url === expectedUrl)
    if (!link.defaultFeedIds?.includes(input.sourceFeedId) || feeds.length !== 1 || matches.length !== 1) campaignDenied('ownership_unproven')
    binding = { catalogId: input.catalogId!, sourceFeedId: input.sourceFeedId, productFeedId: matches[0]!.id, state: 'UNVERIFIED' }
  }
  if (diagnosis && !binding) campaignDenied('ownership_unproven')
  if (binding && !feeds.some(f => f.id === binding!.productFeedId)) campaignDenied('ownership_unproven')
  if ((input.operation === 'refresh' || input.operation === 'create_product_set') && !persistedBinding) campaignDenied('ownership_unproven')
  // A completed repair is reused through its binding rather than duplicated on a fresh request key.
  if (input.operation === 'create_catalog' && bindings.some(b => b.sourceFeedId === input.sourceFeedId && catalogs.some(c => c.id === b.catalogId && c.vertical?.toUpperCase() === 'VEHICLES'))) campaignDenied('already_configured')
  const sets = input.catalogId ? await provider.listProductSets(input.catalogId) : []
  const set = input.productSetId ? sets.find(s => s.id === input.productSetId) : null
  if (input.productSetId && (!set || !binding)) campaignDenied('ownership_unproven')
  const snapshot = { connectionId: connection.id, accountId: connection.accountId, actId: connection.actId, binding, link, feed, businessId: business.id, persistedBinding, catalogId: catalog?.id ?? null, catalogType: catalog?.vertical ?? null, ...(input.operation === 'create_catalog' ? { catalogs } : {}), feeds, set, baseUrl }
  return { connection, binding, bindings, link, feed, provider, catalog, catalogs, business, persistedBinding, sets, set, baseUrl, snapshot }
}
export async function runDepartmentCatalogOperation(name: string, raw: unknown, original: ToolContext, key?: string, digest?: string): Promise<ToolResult> {
  try {
    const contract = departmentCatalogContracts.find(c => c[0] === name)
    if (!contract) campaignDenied('not_found')
    const parsed = contract[1].safeParse(raw)
    if (!parsed.success) campaignDenied('bad_args')
    const input = parsed.data as Input
    if (name === 'marketing_propose_vehicle_catalog') input.operation = 'create_catalog'
    if (name === 'marketing_propose_product_set') input.operation = 'create_product_set'
    if (name === 'marketing_propose_catalog_refresh') input.operation = 'refresh'
    let ctx = await requireMarketingDepartment(original, contract[2])
    const flags = resolveMcpRuntimeConfig(ctx.event)
    if (!flags.serverEnabled || !flags.suiteFlags.feeds || (contract[2] && !flags.suiteFlags.writes)) campaignDenied('disabled')
    await requireDepartmentClient(ctx, input.clientId)
    if (name === 'marketing_list_catalog_connections') return ok(await listCatalogConnections(input.clientId))
    if (name === 'marketing_find_client_catalogs') return ok(await findClientCatalogs(input, await loadCatalog(ctx, input)))
    if (name === 'marketing_get_catalog_change') return ok(paidProposalView(await readPaidProposal(input.proposalId!, ACTION, input.clientId, undefined)))
    if (name === 'marketing_execute_catalog_change' || name === 'marketing_approve_catalog_change') {
      const p = await readPaidProposal(input.proposalId!, ACTION, input.clientId)
      if (p.resolved_payload.revision !== input.expectedRevision) campaignDenied('revision_conflict')
      if (p.status === 'executed') {
        if (p.result_payload?.complete === true && p.result_payload?.providerBusy === true && p.result_payload?.operationSucceeded === false) return catalogRefreshBusy(p.id, p.resolved_payload.revision)
        return p.result_payload?.complete === true ? ok(paidProposalView(p)) : fail('Catalog outcome held for reconciliation.', 'reconciliation_required')
      }
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
      const receipt: Record<string, unknown> = { complete: false, reviewerId, approvedRevision: p.resolved_payload.revision, operation: intent.operation ?? (intent.productSetId ? 'update_product_set' : 'attach_feed'), catalogId: intent.catalogId ?? null, productFeedId: current.binding?.productFeedId ?? null }
      try {
        // Persist the claimed operation before the first provider effect, even if its acknowledgement is lost.
        await savePaidReceipt(p, receipt)
        let catalogId = intent.catalogId
        if (intent.operation === 'create_catalog') {
          const created = await current.provider.createVehicleCatalog(current.business.id, { name: intent.name! })
          catalogId = created.id
          receipt.catalogId = catalogId
          await savePaidReceipt(p, receipt)
        }
        if (intent.operation === 'refresh') {
          let upload: { id: string }
          try {
            upload = await current.provider.createProductFeedUpload(current.binding!.productFeedId, `${current.baseUrl.replace(/\/+$/, '')}/api/feeds/${encodeURIComponent(intent.sourceFeedId)}/serve`)
          } catch (error) {
            // This exact Graph response definitively rejects this refresh before creating an upload.
            // Never apply this exception to attachment/creation, transport errors or readback failures.
            const data = error instanceof MetaCatalogGraphError ? error.data as { error?: { error_subcode?: unknown } } | null : null
            if (!(error instanceof MetaCatalogGraphError) || error.status !== 400 || data?.error?.error_subcode !== 1798046 || receipt.uploadId) throw error
            Object.assign(receipt, { complete: true, operationSucceeded: false, providerRejected: true, providerBusy: true, providerErrorCode: 1798046, providerAccepted: false, providerServingVerified: false })
            await savePaidReceipt(p, receipt)
            return catalogRefreshBusy(p.id, p.resolved_payload.revision)
          }
          receipt.uploadId = upload.id
          await savePaidReceipt(p, receipt)
          const readback = await current.provider.getProductFeed(current.binding!.productFeedId)
          if (readback.id !== current.binding!.productFeedId) throw new Error('Readback mismatch')
          receipt.upload = safeUploadEvidence(readback.latest_upload)
        } else if (intent.operation === 'create_product_set' || intent.productSetId) {
          const filter = metaProductFilter(departmentProductFilter.parse(intent.filter))
          let productSetId = intent.productSetId
          if (intent.operation === 'create_product_set') {
            productSetId = (await current.provider.createProductSet(catalogId!, { name: intent.name!, filter })).id
            receipt.productSetId = productSetId
            await savePaidReceipt(p, receipt)
          } else {
            receipt.productSetId = productSetId
            await savePaidReceipt(p, receipt)
            await current.provider.updateProductSet(productSetId!, { filter })
          }
          const readback = await current.provider.getProductSet(productSetId!)
          if (readback.id !== productSetId || paidHash(JSON.parse(readback.filter ?? '{}')) !== paidHash(filter)) throw new Error('Readback mismatch')
          receipt.productCount = readback.product_count ?? null
        } else {
          await ensureMetaCatalogFeed({ connection: current.connection, clientId: intent.clientId, clientName: current.connection.clientName,
            catalogId: catalogId!, productFeedId: current.binding?.productFeedId, sourceFeedId: intent.sourceFeedId,
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
        receipt.providerAccepted = false
        receipt.providerServingVerified = false
        await savePaidReceipt(p, receipt)
        return ok({ proposalId: p.id, revision: p.resolved_payload.revision, ...receipt })
      } catch { return fail('Catalog outcome held for reconciliation; retained receipts must be inspected before any further action.', 'reconciliation_required') }
    }
    const diagnosis = name === 'marketing_diagnose_catalog' || name === 'marketing_get_catalog_upload_status'
    const current = await loadCatalog(ctx, input, diagnosis)
    if (diagnosis) {
      const readback = await current.provider.getProductFeed(current.binding!.productFeedId)
      if (readback.id !== current.binding!.productFeedId) campaignDenied('ownership_unproven')
      const vertical = current.catalog?.vertical?.toUpperCase()
      return ok({ clientId: input.clientId, connectionId: input.connectionId, catalogId: input.catalogId,
        catalogType: vertical === 'VEHICLES' ? 'VEHICLES' : vertical === 'COMMERCE' ? 'COMMERCE' : 'OTHER',
        persistedBinding: current.persistedBinding, vehicleCatalogRequired: vertical !== 'VEHICLES', productFeedId: readback.id,
        upload: safeUploadEvidence(readback.latest_upload), providerAccepted: false, providerServingVerified: false })
    }
    if (name.startsWith('marketing_propose_')) return ok(paidProposalView(await preparePaidProposal(ACTION, ctx.userId, input as unknown as Record<string, unknown>, current.snapshot, key!, digest!, 'mcp', { mapping: { clientId: input.clientId, connectionId: input.connectionId, catalogId: input.catalogId, sourceFeedId: input.sourceFeedId, sellerRefs: current.link.sellerRefs }, newMapping: !current.binding, currentProductCount: current.set?.product_count ?? null })))
    const view = (s: { id: string, product_count?: number | null }) => ({ productSetId: s.id, productCount: s.product_count ?? null })
    return ok({ clientId: input.clientId, connectionId: input.connectionId, catalogId: input.catalogId, sourceFeedId: input.sourceFeedId, productFeedId: current.binding?.productFeedId,
      productSets: (current.set ? [current.set] : current.sets).slice(0, 100).map(view), truncated: !current.set && current.sets.length > 100, providerServingVerified: false })
  } catch (error) {
    return fail('Catalog operation unavailable or resource ownership is unproven.', (error as { campaignCode?: string }).campaignCode ?? 'unavailable')
  }
}

/** Provider messages, URLs and row samples may contain supplier credentials or customer data. */
function safeUploadEvidence(value: Record<string, unknown> | null | undefined) {
  const count = (v: unknown) => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 ? v : null
  const status = typeof value?.status === 'string' && /^(pending|processing|completed|complete|failed|error|success|finished)$/i.test(value.status) ? value.status.toUpperCase() : 'UNKNOWN'
  const errors = value?.errors && typeof value.errors === 'object' ? (value.errors as Record<string, unknown>).data : []
  const safeErrors = Array.isArray(errors)
    ? errors.slice(0, 100).map(e => ({
        type: typeof e?.error_type === 'string' && /^[A-Z0-9_]{1,100}$/i.test(e.error_type) ? e.error_type : 'UNKNOWN',
        severity: e?.severity === 'fatal' || e?.severity === 'warning' ? e.severity : 'unknown', totalCount: count(e?.total_count)
      }))
    : []
  return { uploadId: typeof value?.id === 'string' && /^\d{5,30}$/.test(value.id) ? value.id : null,
    status: status !== 'UNKNOWN' ? status : value?.end_time ? 'FINISHED' : value?.start_time ? 'PROCESSING' : 'UNKNOWN', errors: safeErrors, errorCount: count(value?.error_count ?? value?.num_invalid_items), warningCount: count(value?.warning_count),
    processedCount: count(value?.num_detected_items), errorCode: count(value?.error_code) }
}

function catalogRefreshBusy(proposalId: string, revision: string): ToolResult {
  return fail('Meta rejected this refresh because an upload is already in progress. Read marketing_get_catalog_upload_status, wait for that upload to finish, then prepare and independently approve a new refresh proposal. This proposal will not retry.', 'provider_busy', {
    proposalId, revision, operationSucceeded: false, providerRejected: true, providerErrorCode: 1798046,
    statusTool: 'marketing_get_catalog_upload_status', retryRequiresNewReviewedProposal: true
  })
}
