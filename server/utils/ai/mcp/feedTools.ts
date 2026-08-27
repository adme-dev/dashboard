import { z } from 'zod'
import { roleHasPermission, type PermissionGroup } from '~~/server/utils/permissions'
import type { ToolContext, ToolResult } from '~~/server/utils/ai/toolContext'
import type { McpExecutionDescriptor, McpProjectionContext, McpToolManifest } from './project'
import type { TrustedSupplementalExecutionServices } from '~~/server/utils/ai/godModeExecution'
import {
  projectConfirmActionManifest,
  resolveRegisteredConfirmDescription
} from './writeTools'

/**
 * MCP Inventory Feed Round (spec: xeroflow-mcp-feed-round.md, 2026-08-20).
 *
 * Mirrors the video-media suite split: this module is PURE (descriptors + projection + guards +
 * injected-dep propose/confirm + shaping helpers), unit-testable with no bindings; the binding half
 * lives in feedRunner.ts. Two reads diagnose feed health / product sets; propose_refresh direct-
 * executes (idempotent re-upload); propose_attach_catalog_feed and propose_set_product_set_rules
 * are SUPPLEMENTAL proposals that genuinely stop at a proposal even under owner god-mode (P-2
 * carve-in) and require confirm_action with ack:true. Every propose tool supports dryRun (P-1):
 * a full preview that writes nothing regardless of caller authority.
 */

export interface FeedToolDescriptor {
  name: string
  description: string
  parameters: z.ZodTypeAny
  requiredPermission: PermissionGroup
}

const UUID = z.string().uuid()
const CATALOG_ID = z.string().regex(/^\d{5,30}$/)
const META_ID = z.string().trim().min(1).max(40)

/** F-6: optional Meta fetch schedule. Omitted → the historical daily-midnight Melbourne default. */
const ScheduleParams = z.object({
  interval: z.enum(['HOURLY', 'DAILY']),
  hour: z.number().int().min(0).max(23).optional(),
  timezone: z.string().trim().min(1).max(64).optional()
})

/** Meta rejects ads whose product set holds fewer than 2 items. */
export const META_PRODUCT_SET_MINIMUM_ITEMS = 2

/** P-2 carve-in: these tools ALWAYS require confirm_action with ack:true, even under owner god-mode. */
export const MCP_FEED_ALWAYS_CONFIRM = [
  'propose_attach_catalog_feed',
  'propose_set_product_set_rules'
] as const

export const MCP_FEED_ALWAYS_CONFIRM_BLOCK = {
  tools: [...MCP_FEED_ALWAYS_CONFIRM],
  reason: 'binds or retargets a client ad account; not reversible from the agent side',
  note: 'requires confirm_action with ack:true regardless of caller authority'
} as const

export const feedReadTools: FeedToolDescriptor[] = [
  {
    name: 'get_inventory_feed_health',
    description:
      'Per-client vehicle inventory feed health: the XeroFlow-served feed (serve URL, item count, '
      + 'byCondition breakdown e.g. new/demo/used, and an excluded breakdown of items the feed DROPPED '
      + 'and why: invalidListingUrl / missingPrice / missingImage), the Meta catalog binding (catalogId, productFeedId, '
      + 'scheduled URL and whether it still points at XeroFlow), last upload status, and every product '
      + 'set with its item count and meetsMinimum (Meta requires at least '
      + `${META_PRODUCT_SET_MINIMUM_ITEMS} items). Read-only — call this first for any feed complaint.`,
    parameters: z.object({ clientId: UUID }),
    requiredPermission: 'MEDIA_BUYING'
  },
  {
    name: 'list_product_sets',
    description:
      'List the product sets of a client\'s Meta vehicle catalog: productSetId, name, filterSummary, '
      + 'itemCount, meetsMinimum, linkedCampaignIds. Product sets are the unit ads actually target — '
      + 'a set below Meta\'s minimum makes a campaign structurally unable to serve catalog ads even '
      + 'while performance metrics look healthy. Read-only.',
    parameters: z.object({ clientId: UUID, catalogId: CATALOG_ID }),
    requiredPermission: 'MEDIA_BUYING'
  },
  {
    name: 'get_ad_product_set_bindings',
    description:
      'Per active ad in a Meta campaign: adId, adName, effectiveStatus, the product set it targets '
      + '(productSetId/productSetName/itemCount), bindingIntact (false means the ad has silently '
      + 'detached from any product set), and hasUnpublishedDraft (null when Meta does not expose draft '
      + 'state). This is the post-change verification a human otherwise performs in Ads Manager after '
      + 'any catalog or product-set change. Read-only.',
    parameters: z.object({ campaignId: META_ID }),
    requiredPermission: 'MEDIA_BUYING'
  }
]

const AttachParams = z.object({
  clientId: UUID,
  connectionId: UUID,
  catalogId: CATALOG_ID,
  productFeedId: META_ID.optional(),
  sourceFeedId: UUID,
  schedule: ScheduleParams.optional(),
  dryRun: z.boolean().optional()
})
export type AttachArgs = z.infer<typeof AttachParams>

const RefreshParams = z.object({
  clientId: UUID,
  connectionId: UUID,
  productFeedId: z.string().trim().min(1).max(40),
  dryRun: z.boolean().optional()
})
export type RefreshArgs = z.infer<typeof RefreshParams>

const SetRulesParams = z.object({
  clientId: UUID,
  connectionId: UUID,
  productSetId: z.string().trim().min(1).max(40),
  filter: z.record(z.string(), z.unknown()),
  /** F-7 post-condition: after the live write, re-read this campaign's ad → product-set bindings and
   *  refuse success if any active ad has detached. */
  verifyCampaignId: META_ID.optional(),
  dryRun: z.boolean().optional()
})
export type SetRulesArgs = z.infer<typeof SetRulesParams>

export const feedProposeTools: FeedToolDescriptor[] = [
  {
    name: 'propose_attach_catalog_feed',
    description:
      'Propose attaching a client\'s XeroFlow-served inventory feed to a Meta vehicle catalog '
      + '(projects the existing admin flow — same guards, schedule, and readback). Returns the FULL '
      + 'before/after: current vs proposed scheduled URL, whether an existing Meta feed is reused or '
      + 'created (feedDisposition), catalog and source feed names, the item count that will be served, '
      + 'and the proposed fetch schedule. An optional productFeedId must belong to the selected '
      + 'catalogue and never falls back to creating a different feed. The optional schedule accepts '
      + '{interval HOURLY|DAILY, hour, timezone}; '
      + 'default daily 00:00 Australia/Melbourne — HOURLY suits fast-turning used/demo stock). '
      + 'Pass dryRun:true for the same preview with NO write and NO proposal. The live call '
      + 'ALWAYS requires confirm_action with ack:true — even under owner god-mode.',
    parameters: AttachParams,
    requiredPermission: 'MEDIA_BUYING'
  },
  {
    name: 'propose_refresh_catalog_feed',
    description:
      'Force Meta to re-fetch a catalog product feed\'s XeroFlow serve URL now instead of waiting for '
      + 'the scheduled fetch. Idempotent, no configuration change. Returns the uploadId and the item '
      + 'count once the upload settles. Pass dryRun:true to preview the feed and serve URL without '
      + 'triggering an upload. The right first response to most feed complaints.',
    parameters: RefreshParams,
    requiredPermission: 'MEDIA_BUYING'
  },
  {
    name: 'propose_set_product_set_rules',
    description:
      'Propose replacing a Meta product set\'s filter. The preview (and dryRun:true) returns the item '
      + 'count the PROPOSED filter would produce against the served feed — e.g. "this change takes the '
      + 'set from 1 item to 22" — alongside the current count. Changing a product set retargets any '
      + 'live campaign using it, so the live call ALWAYS requires confirm_action with ack:true — even '
      + 'under owner god-mode. Pass verifyCampaignId to make the live execute re-read that campaign\'s '
      + 'ad → product-set bindings afterwards and refuse success if any active ad detached. '
      + 'Never writes vehicle data; only the set filter.',
    parameters: SetRulesParams,
    requiredPermission: 'MEDIA_BUYING'
  }
]

// ── Shaping helpers (pure) ─────────────────────────────────────────────────────

/** Bucket served feed items by normalized condition. new/demo/used always present. */
export function shapeByCondition(items: Array<{ condition?: string | null }>): Record<string, number> {
  const byCondition: Record<string, number> = { new: 0, demo: 0, used: 0 }
  for (const item of items) {
    const key = (item.condition ?? '').trim().toLowerCase() || 'unknown'
    byCondition[key] = (byCondition[key] ?? 0) + 1
  }
  return byCondition
}

export function meetsMinimum(itemCount: number | null | undefined): boolean {
  return typeof itemCount === 'number' && itemCount >= META_PRODUCT_SET_MINIMUM_ITEMS
}

/**
 * What the serve/preview pipeline DROPPED and why, from the provider's readiness classification
 * (issueGroups keys 'url'/'price'/'image' are the source of truth — not recomputed here). Honest
 * nulls when the provider returned no readiness data at all.
 */
export function shapeExcluded(
  readiness: { invalidTotal?: number, issueGroups?: Array<{ key: string, count: number }> } | null | undefined
): { invalidListingUrl: number | null, missingPrice: number | null, missingImage: number | null, other: number | null, totalExcluded: number | null } {
  if (!readiness || !Array.isArray(readiness.issueGroups)) {
    return { invalidListingUrl: null, missingPrice: null, missingImage: null, other: null, totalExcluded: null }
  }
  const countFor = (key: string) => readiness.issueGroups!
    .filter(group => group.key === key)
    .reduce((sum, group) => sum + (Number.isFinite(group.count) ? group.count : 0), 0)
  const url = countFor('url')
  const price = countFor('price')
  const image = countFor('image')
  const total = typeof readiness.invalidTotal === 'number' ? readiness.invalidTotal : null
  const groupedOther = readiness.issueGroups!
    .filter(group => !['url', 'price', 'image'].includes(group.key))
    .reduce((sum, group) => sum + (Number.isFinite(group.count) ? group.count : 0), 0)
  const other = total === null
    ? groupedOther
    : Math.max(groupedOther, total - url - price - image, 0)
  return { invalidListingUrl: url, missingPrice: price, missingImage: image, other, totalExcluded: total }
}

/** F-7: shape one campaign ad's product-set binding. bindingIntact = a set is still attached. */
export function shapeAdProductSetBinding(ad: {
  id: string
  name: string
  effective_status: string
  creativeProductSetId: string | null
  adsetProductSetId: string | null
}): { adId: string, adName: string, effectiveStatus: string, productSetId: string | null, bindingIntact: boolean } {
  const productSetId = ad.creativeProductSetId ?? ad.adsetProductSetId ?? null
  return {
    adId: ad.id,
    adName: ad.name,
    effectiveStatus: ad.effective_status,
    productSetId,
    bindingIntact: productSetId !== null
  }
}

/** One-line human summary of a Meta product set filter (which arrives as a JSON string). */
export function summarizeProductSetFilter(filter: string | null | undefined): string {
  if (!filter || !filter.trim()) return 'no filter (all items)'
  try {
    const parsed = JSON.parse(filter)
    return summarizeFilterNode(parsed)
  } catch {
    return filter.slice(0, 200)
  }
}

function summarizeFilterNode(node: unknown): string {
  if (!node || typeof node !== 'object') return String(node)
  const record = node as Record<string, unknown>
  if (Array.isArray(record.and)) return record.and.map(summarizeFilterNode).join(' AND ')
  if (Array.isArray(record.or)) return `(${record.or.map(summarizeFilterNode).join(' OR ')})`
  return Object.entries(record).map(([field, condition]) => {
    if (condition && typeof condition === 'object') {
      return Object.entries(condition as Record<string, unknown>)
        .map(([op, value]) => `${field} ${op} ${JSON.stringify(value)}`)
        .join(' AND ')
    }
    return `${field} = ${JSON.stringify(condition)}`
  }).join(' AND ')
}

/** Vehicle fields a server-side filter preview may reference, mapped onto VehicleSummary keys. */
const FILTER_FIELD_MAP: Record<string, 'condition' | 'make' | 'model' | 'year' | 'price' | 'vin' | 'stockNumber'> = {
  'vehicle_condition': 'condition',
  'condition': 'condition',
  'state_of_vehicle': 'condition',
  'make': 'make',
  'model': 'model',
  'year': 'year',
  'price': 'price',
  'vin': 'vin',
  'stock_number': 'stockNumber',
  'retailer_id': 'stockNumber'
}

type FilterableItem = {
  condition?: string | null
  make?: string | null
  model?: string | null
  year?: number | null
  price?: number | null
  vin?: string | null
  stockNumber?: string | null
}

function normalize(value: unknown): string {
  return String(value ?? '').trim().toLowerCase()
}

function matchesCondition(itemValue: unknown, op: string, expected: unknown): boolean {
  const actual = normalize(itemValue)
  switch (op) {
    case 'eq': case 'i_eq': return actual === normalize(expected)
    case 'neq': case 'i_neq': return actual !== normalize(expected)
    case 'contains': case 'i_contains': return actual.includes(normalize(expected))
    case 'not_contains': case 'i_not_contains': return !actual.includes(normalize(expected))
    case 'is_any': return Array.isArray(expected) && expected.some(candidate => normalize(candidate) === actual)
    case 'is_not_any': return Array.isArray(expected) && !expected.some(candidate => normalize(candidate) === actual)
    case 'gt': return Number(itemValue) > Number(expected)
    case 'gte': return Number(itemValue) >= Number(expected)
    case 'lt': return Number(itemValue) < Number(expected)
    case 'lte': return Number(itemValue) <= Number(expected)
    default: throw new Error(`Unsupported product set filter operator: ${op}`)
  }
}

function evaluateFilterNode(node: unknown, item: FilterableItem): boolean {
  if (!node || typeof node !== 'object') throw new Error('Product set filter node must be an object')
  const record = node as Record<string, unknown>
  if (Array.isArray(record.and)) return record.and.every(child => evaluateFilterNode(child, item))
  if (Array.isArray(record.or)) return record.or.some(child => evaluateFilterNode(child, item))
  return Object.entries(record).every(([field, condition]) => {
    const mapped = FILTER_FIELD_MAP[field.toLowerCase()]
    if (!mapped) throw new Error(`Unsupported product set filter field: ${field}`)
    if (!condition || typeof condition !== 'object' || Array.isArray(condition)) {
      return matchesCondition(item[mapped], 'eq', condition)
    }
    return Object.entries(condition as Record<string, unknown>)
      .every(([op, expected]) => matchesCondition(item[mapped], op, expected))
  })
}

/**
 * Evaluate a PROPOSED product set filter against the XeroFlow-served feed items and return the item
 * count it would produce (the whole value of the F-5 dry run). Throws on any field/operator outside
 * the supported grammar — a preview that cannot count must refuse rather than guess.
 */
export function evaluateProductSetFilter(
  filter: Record<string, unknown>,
  items: FilterableItem[]
): number {
  if (Object.keys(filter).length === 0) return items.length
  return items.filter(item => evaluateFilterNode(filter, item)).length
}

// ── Read execution (injected runner, mirrors executeVideoTool) ─────────────────

export type FeedExecuteOutcome
  = | { ok: true, data: unknown }
    | { ok: false, error: string, code: 'disabled' | 'not_found' | 'forbidden' | 'bad_args' | 'handler_error' }

export type FeedReadRunner = Record<string, (args: unknown, ctx: ToolContext) => Promise<unknown>>

export async function executeFeedReadTool(
  name: string,
  args: unknown,
  ctx: ToolContext,
  deps: { enabled: boolean, runner: FeedReadRunner, bypassPermissions?: boolean }
): Promise<FeedExecuteOutcome> {
  if (!deps.enabled) return { ok: false, error: 'Feed tools are not enabled over MCP.', code: 'disabled' }
  const tool = feedReadTools.find(candidate => candidate.name === name)
  if (!tool) return { ok: false, error: `Unknown feed tool: ${name}`, code: 'not_found' }
  if (!deps.bypassPermissions && !roleHasPermission(ctx.userRole, tool.requiredPermission)) {
    return { ok: false, error: 'Not permitted.', code: 'forbidden' }
  }
  const parsed = tool.parameters.safeParse(args)
  if (!parsed.success) return { ok: false, error: 'Invalid arguments.', code: 'bad_args' }
  const run = deps.runner[name]
  if (!run) return { ok: false, error: 'No runner registered for tool.', code: 'handler_error' }
  try {
    return { ok: true, data: await run(parsed.data, ctx) }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? `Feed tool failed: ${error.message.slice(0, 300)}` : 'Feed tool failed.',
      code: 'handler_error'
    }
  }
}

// ── Propose (P-1 dryRun) + confirm (P-2 ack) ──────────────────────────────────

export const FEED_CONFIRM_ACTIONS = ['feed_attach_catalog', 'feed_set_product_set_rules'] as const
export type FeedConfirmAction = typeof FEED_CONFIRM_ACTIONS[number]

export interface AttachPreview {
  catalogId: string
  catalogName: string | null
  sourceFeedId: string
  sourceFeedName: string | null
  proposedScheduleUrl: string
  currentScheduleUrl: string | null
  /** F-6: the fetch schedule the attach would set (defaults resolved). */
  proposedSchedule: { interval: 'HOURLY' | 'DAILY', hour: number, timezone: string }
  feedDisposition: 'created' | 'reused'
  existingProductFeedId: string | null
  existingProductFeedName: string | null
  willCreateProductFeed: boolean
  itemCount: number | null
}

export interface SetRulesPreview {
  productSetId: string
  productSetName: string | null
  currentFilterSummary: string
  currentItemCount: number | null
  proposedFilter: Record<string, unknown>
  proposedFilterSummary: string
  proposedItemCount: number
}

export interface FeedAttachPendingPayload { kind: 'feed_attach_catalog', args: Omit<AttachArgs, 'dryRun'>, preview: AttachPreview }
export interface FeedSetRulesPendingPayload { kind: 'feed_set_product_set_rules', args: Omit<SetRulesArgs, 'dryRun'>, preview: SetRulesPreview }

export type FeedProposeOutcome
  = | { ok: true, data: unknown }
    | { ok: false, error: string, code: 'disabled' | 'forbidden' | 'bad_args' | 'not_found' | 'handler_error' }

export interface FeedProposeDeps {
  suiteEnabled: boolean
  bypassPermissions?: boolean
  /** Read-only: resolve the full before/after for an attach. Must not create anything in Meta. */
  resolveAttachPreview: (args: Omit<AttachArgs, 'dryRun'>, ctx: ToolContext) => Promise<AttachPreview>
  /** Read-only: current set + the item count the proposed filter would produce. */
  resolveSetRulesPreview: (args: Omit<SetRulesArgs, 'dryRun'>, ctx: ToolContext) => Promise<SetRulesPreview>
  /** Trigger the Meta re-fetch upload (the only write this propose path performs, and only for refresh).
   *  MUST honour args.dryRun by previewing without uploading and echoing dryRun:true. */
  refresh: (args: RefreshArgs, ctx: ToolContext) => Promise<{ productFeedId: string, serveUrl: string, uploadId: string | null, itemCount: number | null, dryRun?: boolean }>
  /** Persist an ai_pending_actions row (tool_name = action) and return its id. */
  persist: (ctx: ToolContext, action: FeedConfirmAction, payload: unknown) => Promise<string>
}

function proposeFailure(error: unknown, fallback: string): FeedProposeOutcome {
  const message = error instanceof Error && error.message ? error.message.slice(0, 300) : fallback
  const code = error instanceof Error && /unsupported product set filter/i.test(error.message) ? 'bad_args' : 'handler_error'
  return { ok: false, error: message, code }
}

/**
 * Propose (or dry-run, or for refresh: execute) a feed action. Never throws. dryRun performs the full
 * read-only preview and persists nothing — verified by tests that assert persist/refresh are untouched.
 */
export async function executeFeedPropose(
  name: string,
  args: unknown,
  ctx: ToolContext,
  deps: FeedProposeDeps
): Promise<FeedProposeOutcome> {
  if (!deps.suiteEnabled) return { ok: false, error: 'Feed tools are not enabled over MCP.', code: 'disabled' }
  const tool = feedProposeTools.find(candidate => candidate.name === name)
  if (!tool) return { ok: false, error: `Unknown feed tool: ${name}`, code: 'not_found' }
  if (!deps.bypassPermissions && !roleHasPermission(ctx.userRole, tool.requiredPermission)) {
    return { ok: false, error: 'Not permitted.', code: 'forbidden' }
  }

  if (name === 'propose_attach_catalog_feed') {
    const parsed = AttachParams.safeParse(args)
    if (!parsed.success) return { ok: false, error: 'Invalid arguments.', code: 'bad_args' }
    const { dryRun, ...rest } = parsed.data
    try {
      const preview = await deps.resolveAttachPreview(rest, ctx)
      if (dryRun) return { ok: true, data: { dryRun: true as const, kind: 'feed_attach_catalog', ...preview } }
      const payload: FeedAttachPendingPayload = { kind: 'feed_attach_catalog', args: rest, preview }
      const proposalId = await deps.persist(ctx, 'feed_attach_catalog', payload)
      return { ok: true, data: { proposalId, kind: 'feed_attach_catalog', requiresAck: true as const, ...preview } }
    } catch (error) {
      return proposeFailure(error, 'Attach preview failed.')
    }
  }

  if (name === 'propose_refresh_catalog_feed') {
    const parsed = RefreshParams.safeParse(args)
    if (!parsed.success) return { ok: false, error: 'Invalid arguments.', code: 'bad_args' }
    const { dryRun, ...rest } = parsed.data
    try {
      // Idempotent, no configuration change → direct-executes. dryRun previews without uploading;
      // the runner is responsible for honouring it (it receives dryRun explicitly).
      const result = await deps.refresh({ ...rest, dryRun }, ctx)
      if (dryRun && !result.dryRun) {
        return { ok: false, error: 'Refresh runner ignored dryRun.', code: 'handler_error' }
      }
      return { ok: true, data: { kind: 'feed_refresh', ...(dryRun ? { dryRun: true as const } : {}), ...result } }
    } catch (error) {
      return proposeFailure(error, 'Feed refresh failed.')
    }
  }

  // propose_set_product_set_rules
  const parsed = SetRulesParams.safeParse(args)
  if (!parsed.success) return { ok: false, error: 'Invalid arguments.', code: 'bad_args' }
  const { dryRun, ...rest } = parsed.data
  try {
    const preview = await deps.resolveSetRulesPreview(rest, ctx)
    if (dryRun) return { ok: true, data: { dryRun: true as const, kind: 'feed_set_product_set_rules', ...preview } }
    const payload: FeedSetRulesPendingPayload = { kind: 'feed_set_product_set_rules', args: rest, preview }
    const proposalId = await deps.persist(ctx, 'feed_set_product_set_rules', payload)
    return { ok: true, data: { proposalId, kind: 'feed_set_product_set_rules', requiresAck: true as const, ...preview } }
  } catch (error) {
    return proposeFailure(error, 'Product set preview failed.')
  }
}

// ── Confirm dispatch (P-2: ack:true is mandatory; refuses under any authority) ─

export interface FeedClaimedRow { tool_name: string, resolved_payload: unknown }

export type FeedConfirmOutcome
  = | { ok: true, data: unknown }
    | { ok: false, error: string, code: 'confirm_required' | 'forbidden' | 'handler_error' }

export interface FeedConfirmDeps {
  /** Execute the attach via attachMetaCatalogFeedForClient (readback asserted inside). */
  executeAttach: (payload: FeedAttachPendingPayload, ctx: ToolContext) => Promise<unknown>
  /** Apply the product set filter, then read it back and assert it matches the intent (P-3). */
  applySetRules: (payload: FeedSetRulesPendingPayload, ctx: ToolContext) => Promise<unknown>
  execution?: TrustedSupplementalExecutionServices
}

export async function dispatchFeedConfirm(
  row: FeedClaimedRow,
  ack: boolean,
  ctx: ToolContext,
  deps: FeedConfirmDeps
): Promise<FeedConfirmOutcome | null> {
  if (!(FEED_CONFIRM_ACTIONS as readonly string[]).includes(row.tool_name)) return null
  // P-2: the carve-in. No authority level — owner god-mode included — executes without ack:true.
  if (!ack) {
    return {
      ok: false,
      error: 'This feed action binds or retargets a client ad account and requires explicit ack:true.',
      code: 'confirm_required'
    }
  }
  try {
    await deps.execution?.markDispatched()
    if (row.tool_name === 'feed_attach_catalog') {
      return { ok: true, data: await deps.executeAttach(row.resolved_payload as FeedAttachPendingPayload, ctx) }
    }
    return { ok: true, data: await deps.applySetRules(row.resolved_payload as FeedSetRulesPendingPayload, ctx) }
  } catch (error) {
    const message = error instanceof Error && error.message ? error.message.slice(0, 300) : 'Execution failed.'
    return { ok: false, error: message, code: 'handler_error' }
  }
}

// ── Projection + execution descriptors ─────────────────────────────────────────

export function projectFeedTools(
  role: string,
  suiteEnabled: boolean,
  options: { bypassPermissions?: boolean, confirmDescription?: string } = {}
): McpToolManifest[] {
  if (!suiteEnabled) return []
  if (!options.bypassPermissions && !roleHasPermission(role, 'MEDIA_BUYING')) return []
  const manifests = [...feedReadTools, ...feedProposeTools].map(tool => ({
    name: tool.name,
    description: tool.description,
    inputSchema: z.toJSONSchema(tool.parameters) as Record<string, unknown>
  }))
  return [...manifests, projectConfirmActionManifest(options.confirmDescription)]
}

/** Registered inventory-feed suite adapter. Gated by MCP_FEED_TOOLS_ENABLED unless god-mode. */
export function projectFeedMcpSuite(context: McpProjectionContext): McpToolManifest[] {
  return projectFeedTools(
    context.role,
    context.governanceBypass || context.suiteFlags.feeds,
    {
      bypassPermissions: context.governanceBypass,
      confirmDescription: resolveRegisteredConfirmDescription(context)
    }
  )
}

/** Complete executable descriptors for the feed reads and proposal writers. */
export function resolveFeedMcpExecutions(): McpExecutionDescriptor[] {
  const reads = feedReadTools.map(descriptor => ({
    name: descriptor.name,
    canonicalName: descriptor.name,
    kind: 'supplemental' as const,
    tool: {
      ...descriptor,
      mutates: false,
      handler: async (args: unknown, ctx: ToolContext): Promise<ToolResult> => {
        const { buildFeedReadRunner } = await import('./feedRunner')
        const outcome = await executeFeedReadTool(descriptor.name, args, ctx, {
          enabled: true,
          bypassPermissions: true,
          runner: buildFeedReadRunner()
        })
        return outcome.ok
          ? { ok: true, data: outcome.data }
          : { ok: false, error: outcome.error, code: outcome.code }
      }
    }
  }))
  const proposals = feedProposeTools.map(descriptor => ({
    name: descriptor.name,
    canonicalName: descriptor.name,
    kind: 'supplemental' as const,
    executionClass: 'internal-http' as const,
    executeSupplemental: async (args: unknown, ctx: ToolContext, services: TrustedSupplementalExecutionServices): Promise<ToolResult> => {
      const { buildFeedProposeDeps } = await import('./feedRunner')
      const baseDeps = buildFeedProposeDeps()
      const outcome = await executeFeedPropose(descriptor.name, args, ctx, {
        suiteEnabled: true,
        bypassPermissions: true,
        ...baseDeps,
        persist: async (...persistArgs) => {
          await services.markDispatched()
          return await baseDeps.persist(...persistArgs)
        },
        refresh: async (refreshArgs, refreshCtx) => {
          // A dry run never uploads, so the durable dispatch marker only stamps real refreshes.
          if (!refreshArgs.dryRun) await services.markDispatched()
          return await baseDeps.refresh(refreshArgs, refreshCtx)
        }
      })
      return outcome.ok
        ? { ok: true, data: outcome.data }
        : { ok: false, error: outcome.error, code: outcome.code }
    },
    tool: {
      ...descriptor,
      mutates: true,
      handler: async (args: unknown, ctx: ToolContext): Promise<ToolResult> => {
        const { buildFeedProposeDeps } = await import('./feedRunner')
        const outcome = await executeFeedPropose(descriptor.name, args, ctx, {
          suiteEnabled: true,
          bypassPermissions: true,
          ...buildFeedProposeDeps()
        })
        return outcome.ok
          ? { ok: true, data: outcome.data }
          : { ok: false, error: outcome.error, code: outcome.code }
      }
    }
  }))
  return [...reads, ...proposals]
}
