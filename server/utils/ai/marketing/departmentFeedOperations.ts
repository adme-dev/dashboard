import { createHash } from 'node:crypto'
import { createError } from 'h3'
import { queryOneFresh, transactionWithoutRetry } from '~~/server/utils/db'
import { getDealerLink, linkToContext } from '~~/server/utils/feeds/dealerLinks'
import {
  getSocialDashboardClient,
  isDealerFeedsEnabled
} from '~~/server/utils/feeds/config'
import { getFeedProvider } from '~~/server/utils/feeds/registry'
import { buildInventoryPreviewFilters } from '~~/server/utils/feeds/providers/socialDashboard'
import { normalizeDealerFeedFilters } from '~~/server/utils/feeds/filterInput'
import { summarizeFeedReadiness } from '~~/server/utils/feeds/readiness'
import type {
  DealerLink,
  FeedDetail,
  FeedPreviewResult,
  FeedRef,
  FeedPlatform
} from '~~/server/utils/feeds/types'
import { resolveMcpRuntimeConfig } from '../mcp/runtimeConfig'
import { requireMarketingDepartment } from './departmentAuthority'
import { isExactNativeFeedScope } from './departmentCatalogSchemas'
import { fail, ok, type ToolContext, type ToolResult } from '../toolContext'

const ACTION = 'department_inventory_feed_change'
const MUTATIONS = new Set([
  'marketing_propose_inventory_feed_setup',
  'marketing_propose_inventory_feed_change',
  'marketing_propose_inventory_feed_regeneration',
  'marketing_review_inventory_feed_change',
  'marketing_execute_inventory_feed_change'
])
function stop(message: string, code = 'forbidden'): never {
  throw Object.assign(
    createError({ statusCode: 403, statusMessage: message }),
    { feedCode: code }
  )
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object')
    return `{${Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
      .join(',')}}`
  return JSON.stringify(value) ?? 'null'
}
function hash(value: unknown): string {
  return createHash('sha256').update(canonical(value)).digest('hex')
}
function safeText(value: unknown): string | null {
  return typeof value === 'string'
    && !/https?:\/\/|token[=:]|secret[=:]|bearer\s/i.test(value)
    ? value.slice(0, 160)
    : null
}
/** Fresh active-client check applies before any link, provider, or proposal read. */
async function requireClient(ctx: ToolContext, clientId: string) {
  if (ctx.clientScope && ctx.clientScope !== clientId)
    stop('Client not available.', 'not_found')
  if (
    !ctx.assistantScope
    || (ctx.assistantScope.clientAccessMode !== 'all_active'
      && !ctx.assistantScope.assignedClientIds.includes(clientId))
  )
    stop('Client not available.', 'not_found')
  if (
    !(await queryOneFresh(
      'SELECT id FROM agency_clients WHERE id = $1 AND is_active = TRUE',
      [clientId]
    ))
  )
    stop('Client not available.', 'not_found')
}
async function environment(ctx: ToolContext) {
  // Deployed bindings are authoritative, including an empty binding object.
  const binding = ctx.event.context.cloudflare?.env as
    Record<string, string | undefined> | undefined
  const env = binding === undefined ? process.env : binding
  if (!isDealerFeedsEnabled(env)) stop('Dealer feeds are disabled.', 'disabled')
  const client = await getSocialDashboardClient({
    env,
    runtimeEnv: env,
    queryOne: queryOneFresh
  })
  if (!client) stop('Dealer feed provider is not configured.', 'not_ready')
  return client
}
async function load(ctx: ToolContext, clientId: string) {
  const link = await getDealerLink(clientId, undefined, {
    queryOne: queryOneFresh
  })
  if (!link || !link.sellerRefs.length || !link.externalOrgId)
    stop('An active dealer mapping with seller scope is required.', 'not_ready')
  const provider = getFeedProvider(link.providerId, {
    socialDashboardClient: await environment(ctx)
  })
  return {
    link,
    provider,
    providerContext: linkToContext(link, ctx.userEmail ?? '')
  }
}
type Loaded = Awaited<ReturnType<typeof load>>
/** Org membership alone is insufficient when several clients share a provider organization. */
function sellerScoped(detail: FeedDetail, link: DealerLink): boolean {
  return isExactNativeFeedScope(detail, link)
}
async function scopedFeed(loaded: Loaded, feedId: string): Promise<FeedDetail> {
  const list = await loaded.provider.listFeeds(
    loaded.providerContext,
    loaded.link
  )
  const item = list.find(f => f.id === feedId)
  if (!item) stop('Feed not available for this client.', 'not_found')
  const detail = await loaded.provider.getFeed(loaded.providerContext, {
    providerId: loaded.link.providerId,
    feedId,
    platform: item.platform
  })
  if (detail.id !== feedId || !sellerScoped(detail, loaded.link))
    stop('Feed seller scope does not match this client.', 'not_found')
  return detail
}
function ref(link: DealerLink, detail: FeedDetail): FeedRef {
  return {
    providerId: link.providerId,
    feedId: detail.id,
    platform: detail.platform
  }
}
function feedView(
  detail: Pick<FeedDetail, 'id' | 'name' | 'platform' | 'isActive'>
) {
  return {
    feedId: detail.id,
    name: safeText(detail.name),
    platform: detail.platform,
    isActive: detail.isActive
  }
}
function previewView(preview: FeedPreviewResult) {
  const readiness = summarizeFeedReadiness(preview.validation)
  return {
    matchedItemCount: preview.validation?.matchedTotal ?? null,
    eligibleItemCount: preview.validation?.validatedTotal ?? null,
    readiness: {
      status: readiness.status,
      invalidTotal: preview.validation?.invalidTotal ?? null,
      issues: readiness.issueGroups.map(g => ({
        field: g.field,
        count: g.count,
        fixMode: g.fixMode
      }))
    },
    previewLimit: 100,
    previewTruncated: preview.total > preview.items.length,
    items: preview.items.map(i => ({
      id: safeText(i.id),
      make: safeText(i.make),
      model: safeText(i.model),
      year: i.year ?? null,
      price: i.price ?? null,
      condition: safeText(i.condition)
    }))
  }
}
// Inputs are validated by the explicit tool schemas before reaching this service.
interface FeedOperationInput {
  clientId: string
  proposalId?: string
  feedId?: string
  name?: string
  platform?: FeedPlatform
  filters?: Record<string, unknown>
  patch?: {
    name?: string
    filters?: Record<string, unknown>
    isActive?: boolean
  }
  ack?: boolean
  expectedRevision?: string
  decision?: 'approved' | 'rejected'
  reason?: string
  format?: 'xml' | 'csv'
  limit?: number
}
interface Payload {
  version: 1
  clientId: string
  requestKey: string
  requestDigest: string
  intentHash: string
  operation: 'setup' | 'change' | 'regenerate'
  input: FeedOperationInput
  before: Pick<FeedDetail, 'id' | 'name' | 'platform' | 'isActive'> | null
  mapping: DealerLink
  revision: string
  preview: ReturnType<typeof previewView>
  review?: {
    decision: 'approved' | 'rejected'
    reviewerId: string
    reviewedAt: string
    reason?: string
  }
}
interface Row {
  id: string
  user_id: string
  tool_name: string
  status: string
  expires_at: string
  confirmed_by: string | null
  resolved_payload: Payload
  result_payload: unknown
}
function proposalView(row: Row) {
  const p = row.resolved_payload
  return {
    proposalId: row.id,
    clientId: p.clientId,
    operation: p.operation,
    revision: p.revision,
    status: row.status,
    expiresAt: row.expires_at,
    requiresAck: true,
    review: p.review
      ? {
          decision: p.review.decision,
          reviewerId: p.review.reviewerId,
          reviewedAt: p.review.reviewedAt,
          reason: safeText(p.review.reason)
        }
      : null,
    before: p.before ? feedView(p.before) : null,
    proposed: {
      name: safeText(p.input.name ?? p.input.patch?.name ?? p.before?.name),
      platform: p.input.platform ?? p.before?.platform,
      isActive: p.input.patch?.isActive ?? p.before?.isActive ?? true,
      filters: p.input.filters ?? p.input.patch?.filters ?? null,
      format: p.input.format ?? null
    },
    preview: p.preview,
    outcome:
      row.result_payload
      ?? (row.status === 'executed' ? { reconciliationRequired: true } : null)
  }
}
async function requireProposalReviewer(ctx: ToolContext, row: Row, reviewerId = ctx.userId) {
  const { requireIndependentMarketingReviewer } = await import('./reviewAuthority')
  await requireIndependentMarketingReviewer(ctx.event, {
    requesterId: row.user_id,
    clientId: row.resolved_payload.clientId,
    reviewerId
  })
}
async function requireCurrentProposer(ctx: ToolContext, row: Row) {
  const { resolveMcpStaffContext } = await import('../mcp/staffAuthority')
  const proposer = await resolveMcpStaffContext(ctx.event, row.user_id, [])
  if (
    proposer.mcpStaffAuthority !== 'fresh'
    || !proposer.permissionGroups?.includes('MARKETING_MANAGEMENT')
    || !proposer.marketingCapabilities?.includes('department_management')
    || proposer.assistantReadOnly
  ) stop('Feed proposer authority is no longer available.', 'approval_required')
  await requireClient(proposer, row.resolved_payload.clientId)
}
async function readProposal(
  ctx: ToolContext,
  id: string,
  clientId: string,
  access: 'owner' | 'reviewer' | 'either' = 'owner'
): Promise<Row> {
  const row = await queryOneFresh<Row>(
    `SELECT id, user_id, tool_name, status, expires_at, confirmed_by, resolved_payload, result_payload FROM ai_pending_actions
    WHERE id = $1 AND source = 'mcp' AND tool_name = $2`,
    [id, ACTION]
  )
  if (
    !row
    || row.tool_name !== ACTION
    || row.resolved_payload?.version !== 1
    || row.resolved_payload.clientId !== clientId
    || (access === 'owner' && row.user_id !== ctx.userId)
    || (access === 'reviewer' && row.user_id === ctx.userId)
  ) stop('Department feed proposal not found.', 'not_found')
  if (access === 'reviewer' || (access === 'either' && row.user_id !== ctx.userId)) {
    await requireProposalReviewer(ctx, row)
  }
  return row
}
async function propose(
  name: string,
  input: FeedOperationInput,
  ctx: ToolContext,
  key: string,
  digest: string
) {
  const intentHash = hash({ name, input })
  // Transaction-scoped advisory lock serializes concurrent retries using the existing durable table.
  return transactionWithoutRetry(async (db) => {
    await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
      `${ctx.userId}:${key}`
    ])
    const prior = (
      await db.query(
        `SELECT id, user_id, tool_name, status, expires_at, confirmed_by, resolved_payload, result_payload FROM ai_pending_actions
      WHERE resolved_payload->>'requestKey' = $1 AND user_id = $2 AND source = 'mcp' AND tool_name = $3`,
        [key, ctx.userId, ACTION]
      )
    ).rows[0] as Row | undefined
    if (prior) {
      if (
        prior.resolved_payload.intentHash !== intentHash
        || prior.resolved_payload.requestDigest !== digest
      )
        stop(
          'Idempotency key belongs to a different request.',
          'idempotency_conflict'
        )
      return ok(proposalView(prior))
    }
    const loaded = await load(ctx, input.clientId)
    const before
      = name !== 'marketing_propose_inventory_feed_setup'
        ? await scopedFeed(loaded, input.feedId!)
        : null
    const nextFilters
      = input.filters || input.patch?.filters
        ? buildInventoryPreviewFilters(
            normalizeDealerFeedFilters(input.filters ?? input.patch!.filters),
            loaded.link.sellerRefs
          )
        : before!.filters
    // Existing mappings/source stay internal; requests cannot set or replace either.
    const preview = await loaded.provider.previewInventory(
      loaded.providerContext,
      loaded.link,
      {
        name: input.name ?? input.patch?.name ?? before?.name,
        platform: input.platform ?? before!.platform,
        filters: nextFilters,
        mappings: before?.mappings ?? {},
        platformSettings: before?.platformSettings ?? {},
        source: before?.source ?? undefined
      },
      { limit: 100, offset: 0 }
    )
    const revision = hash({ input, before, mapping: loaded.link })
    const payload: Payload = {
      version: 1,
      clientId: input.clientId,
      requestKey: key,
      requestDigest: digest,
      intentHash,
      operation: name === 'marketing_propose_inventory_feed_setup'
        ? 'setup'
        : name === 'marketing_propose_inventory_feed_regeneration' ? 'regenerate' : 'change',
      input,
      // The revision binds the full private source/mappings; never copy them into a proposal row.
      before: before ? { id: before.id, name: safeText(before.name) ?? '', platform: before.platform, isActive: before.isActive } : null,
      mapping: loaded.link,
      revision,
      preview: previewView(preview)
    }
    const row = (
      await db.query(
        `INSERT INTO ai_pending_actions (user_id, tool_name, resolved_payload, status, source, conversation_id)
      VALUES ($1, $2, $3::jsonb, 'proposed', 'mcp', NULL) RETURNING id, user_id, tool_name, status, expires_at, confirmed_by, resolved_payload, result_payload`,
        [ctx.userId, ACTION, JSON.stringify(payload)]
      )
    ).rows[0] as Row
    return ok(proposalView(row))
  })
}
async function review(
  input: FeedOperationInput,
  ctx: ToolContext
): Promise<ToolResult> {
  const row = await readProposal(ctx, input.proposalId!, input.clientId, 'reviewer')
  const payload = row.resolved_payload
  if (input.expectedRevision !== payload.revision || input.decision == null)
    stop('Exact feed review revision and decision required.', 'revision_conflict')
  await requireCurrentProposer(ctx, row)
  const reviewedPayload: Payload = {
    ...payload,
    review: {
      decision: input.decision,
      reviewerId: ctx.userId,
      reviewedAt: new Date().toISOString(),
      ...(input.reason ? { reason: input.reason } : {})
    }
  }
  const status = input.decision === 'approved' ? 'approved' : 'cancelled'
  const reviewed = await transactionWithoutRetry(async db => (await db.query(
    `UPDATE ai_pending_actions SET status=$3, confirmed_by=$4, resolved_payload=$5::jsonb
      WHERE id=$1 AND user_id=$2 AND source='mcp' AND tool_name=$6 AND status='proposed'
        AND expires_at>NOW() AND resolved_payload=$7::jsonb RETURNING id`,
    [row.id, row.user_id, status, ctx.userId, JSON.stringify(reviewedPayload), ACTION, JSON.stringify(payload)]
  )).rows[0])
  if (!reviewed) stop('Feed proposal expired or was already reviewed.', 'revision_conflict')
  return ok(proposalView({ ...row, status, confirmed_by: ctx.userId, resolved_payload: reviewedPayload }))
}
async function execute(
  input: FeedOperationInput,
  initial: ToolContext
): Promise<ToolResult> {
  let ctx = initial
  const row = await readProposal(ctx, input.proposalId!, input.clientId)
  const payload = row.resolved_payload
  if (input.ack !== true || input.expectedRevision !== payload.revision)
    stop('Exact feed revision acknowledgement required.', 'revision_conflict')
  if (row.status === 'executed')
    return row.result_payload
      ? ok(row.result_payload)
      : fail(
          'Feed outcome requires reconciliation; do not retry the provider write.',
          'reconciliation_required'
        )
  const reviewerId = payload.review?.reviewerId
  if (
    row.status !== 'approved'
    || payload.review?.decision !== 'approved'
    || !reviewerId
    || reviewerId === row.user_id
    || row.confirmed_by !== reviewerId
    || new Date(row.expires_at).getTime() <= Date.now()
  ) stop('An unexpired independent approval is required.', 'approval_required')
  await requireCurrentProposer(ctx, row)
  await requireProposalReviewer(ctx, row, reviewerId)
  const loaded = await load(ctx, input.clientId)
  const before
    = payload.operation !== 'setup'
      ? await scopedFeed(loaded, payload.input.feedId!)
      : null
  if (
    hash({ input: payload.input, before, mapping: loaded.link })
    !== payload.revision
  )
    stop(
      'Feed configuration or dealer mapping changed. Prepare a new proposal.',
      'revision_conflict'
    )
  // Refresh permission/grant/client immediately before durable claim and provider dispatch.
  ctx = await requireMarketingDepartment(ctx, true)
  await requireClient(ctx, input.clientId)
  const claimed = await transactionWithoutRetry(
    async db =>
      (
        await db.query(
          `UPDATE ai_pending_actions SET status = 'executed', executed_at = NOW()
    WHERE id = $1 AND user_id = $2 AND source = 'mcp' AND tool_name = $3 AND status = 'approved'
      AND expires_at > NOW() AND resolved_payload = $4::jsonb AND confirmed_by = $5 RETURNING id`,
          [row.id, ctx.userId, ACTION, JSON.stringify(payload), reviewerId]
        )
      ).rows[0]
  )
  if (!claimed)
    return fail(
      'Feed proposal was claimed or changed; read its status.',
      'reconciliation_required'
    )
  // A committed claim survives timeout, readback failure and lost acknowledgements. Never revert it.
  try {
    let target: FeedRef
    let generation: { format: 'xml' | 'csv', itemCount: number } | null = null
    if (payload.operation === 'setup') {
      target = await loaded.provider.createFeed(
        loaded.providerContext,
        loaded.link,
        {
          name: payload.input.name!,
          platform: payload.input.platform!,
          filters: buildInventoryPreviewFilters(
            normalizeDealerFeedFilters(payload.input.filters),
            loaded.link.sellerRefs
          ),
          externalKey: `department-feed:${row.id}`
        }
      )
    } else {
      target = ref(loaded.link, before!)
      if (payload.operation === 'regenerate') {
        const generated = await loaded.provider.generateFeed(
          loaded.providerContext,
          target,
          payload.input.format!
        )
        generation = { format: payload.input.format!, itemCount: generated.itemCount }
      } else {
        const patch: Record<string, unknown> = { ...payload.input.patch }
        if (patch.filters)
          patch.filters = buildInventoryPreviewFilters(
            normalizeDealerFeedFilters(patch.filters),
            loaded.link.sellerRefs
          )
        if ('isActive' in patch) {
          patch.is_active = patch.isActive
          delete patch.isActive
        }
        await loaded.provider.updateFeed(loaded.providerContext, target, patch)
      }
    }
    const readback = await scopedFeed(loaded, target.feedId)
    if (
      payload.operation === 'regenerate'
      && hash({ input: payload.input, before: readback, mapping: loaded.link }) !== payload.revision
    ) throw new Error('Feed changed during regeneration')
    const expected
      = payload.operation === 'setup'
        ? {
            name: payload.input.name!,
            platform: payload.input.platform!,
            filters: buildInventoryPreviewFilters(
              normalizeDealerFeedFilters(payload.input.filters),
              loaded.link.sellerRefs
            )
          }
        : payload.operation === 'change'
          ? {
              ...payload.input.patch,
              ...(payload.input.patch!.filters
                ? {
                    filters: buildInventoryPreviewFilters(
                      normalizeDealerFeedFilters(payload.input.patch!.filters),
                      loaded.link.sellerRefs
                    )
                  }
                : {})
            }
          : {}
    if (
      Object.entries(expected).some(
        ([k, v]) => canonical(readback[k as keyof FeedDetail]) !== canonical(v)
      )
    )
      throw new Error('Readback mismatch')
    const result = {
      proposalId: row.id,
      revision: payload.revision,
      feed: feedView(readback),
      ...(generation ? { generation } : {}),
      readbackVerified: true,
      providerDeliveryVerified: false
    }
    await transactionWithoutRetry(async (db) => {
      await db.query(
        `UPDATE ai_pending_actions SET result_payload = $3::jsonb, result_ref = $4
      WHERE id = $1 AND user_id = $2 AND source = 'mcp' AND tool_name = $5`,
        [row.id, ctx.userId, JSON.stringify(result), target.feedId, ACTION]
      )
    })
    return ok(result)
  } catch {
    return fail(
      'Feed outcome requires reconciliation; do not retry the provider write.',
      'reconciliation_required'
    )
  }
}
export async function runDepartmentFeedOperation(
  name: string,
  raw: unknown,
  original: ToolContext,
  key?: string,
  digest?: string
): Promise<ToolResult> {
  try {
    const write = MUTATIONS.has(name)
    const ctx = await requireMarketingDepartment(original, write)
    const config = resolveMcpRuntimeConfig(ctx.event)
    if (
      !config.serverEnabled
      || !config.suiteFlags.feeds
      || (write && !config.suiteFlags.writes)
    )
      stop('Department feed capability is disabled.', 'disabled')
    const input = raw as FeedOperationInput
    await requireClient(ctx, input.clientId)
    if (name === 'marketing_get_inventory_feed_change')
      return ok(
        proposalView(await readProposal(ctx, input.proposalId!, input.clientId, 'either'))
      )
    if (name === 'marketing_review_inventory_feed_change')
      return await review(input, ctx)
    if (name === 'marketing_execute_inventory_feed_change')
      return await execute(input, ctx)
    if (write) return await propose(name, input, ctx, key!, digest!)
    const loaded = await load(ctx, input.clientId)
    if (name === 'marketing_preview_inventory_feed') {
      const detail = await scopedFeed(loaded, input.feedId!)
      const preview = await loaded.provider.previewFeed(
        loaded.providerContext,
        loaded.link,
        ref(loaded.link, detail),
        { limit: input.limit, offset: 0 }
      )
      return ok({
        clientId: input.clientId,
        feed: feedView(detail),
        ...previewView(preview),
        previewLimit: input.limit
      })
    }
    const list = await loaded.provider.listFeeds(
      loaded.providerContext,
      loaded.link
    )
    const feeds = []
    for (const summary of list.slice(0, 50)) {
      const detail = await loaded.provider.getFeed(loaded.providerContext, {
        providerId: loaded.link.providerId,
        feedId: summary.id,
        platform: summary.platform
      })
      if (!sellerScoped(detail, loaded.link)) continue
      const preview = await loaded.provider.previewFeed(
        loaded.providerContext,
        loaded.link,
        ref(loaded.link, detail),
        { limit: 100, offset: 0 }
      )
      const { items: _items, ...health } = previewView(preview)
      feeds.push({ ...feedView(detail), ...health })
    }
    return ok({
      clientId: input.clientId,
      feeds,
      providerReadAt: new Date().toISOString(),
      complete: list.length <= 50,
      dataStatus: feeds.length ? 'available' : 'no_scoped_feeds',
      providerDeliveryVerified: false,
      unavailableOperations: [
        'supplier connection/credential changes require verified seller/org ownership',
        'Meta catalogue/product-set changes require client/catalogue/set binding validation',
        'raw inventory edits and Google Merchant Center ingestion/approval have no department executor'
      ]
    })
  } catch (error) {
    const safe = error as { feedCode?: string, statusMessage?: string }
    return fail(
      safe.feedCode
        ? safe.statusMessage!
        : 'Department feed operation unavailable or not permitted.',
      safe.feedCode ?? 'unavailable'
    )
  }
}
