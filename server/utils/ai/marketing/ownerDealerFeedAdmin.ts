import { createError } from 'h3'
import { z } from 'zod'
import { queryOneFresh, queryRowsFresh, transactionWithoutRetry } from '~~/server/utils/db'
import { getDealerLink, linkToContext } from '~~/server/utils/feeds/dealerLinks'
import {
  deactivateDealerLink,
  listDealerLinks,
  upsertDealerLink
} from '~~/server/utils/feeds/dealerLinkStore'
import { resolveDealerFeedOrganization } from '~~/server/utils/feeds/organizationResolver'
import { getSocialDashboardClient, isDealerFeedsEnabled } from '~~/server/utils/feeds/config'
import { SOCIAL_DASHBOARD_PROVIDER_ID } from '~~/server/utils/feeds/constants'
import { getFeedProvider } from '~~/server/utils/feeds/registry'
import { buildInventoryPreviewFilters } from '~~/server/utils/feeds/providers/socialDashboard'
import { normalizeDealerFeedFilters } from '~~/server/utils/feeds/filterInput'
import { summarizeFeedReadiness } from '~~/server/utils/feeds/readiness'
import type { DealerLink, FeedDetail, FeedPlatform } from '~~/server/utils/feeds/types'
import { isActiveGodModeAuthority } from '~~/server/utils/godMode/authority'
import type { TrustedSupplementalExecutionServices } from '../godModeExecution'
import { getMcpRequestGodModeAuthority } from '../mcp/requestClaim'
import { fail, ok, type ToolContext, type ToolResult } from '../toolContext'
import {
  isBareNativeFeedSource,
  isScopedDepartmentFeed
} from './departmentFeedOwnership'

const UUID = z.string().uuid()
const FEED_ID = z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/)
const SELLER_REF = z.string().trim().min(1).max(160)
const ORG_ID = z.string().trim().min(1).max(128)
const WORDS = z.array(z.string().trim().min(1).max(160)).max(100)
const RANGE = z.strictObject({
  min: z.number().finite().nonnegative().optional(),
  max: z.number().finite().nonnegative().optional()
})
const CREATE_FILTERS = z.strictObject({
  makes: WORDS.optional(),
  models: WORDS.optional(),
  condition: WORDS.optional(),
  bodyTypes: WORDS.optional(),
  fuelTypes: WORDS.optional(),
  transmission: WORDS.optional(),
  colors: WORDS.optional(),
  stockStatus: WORDS.optional(),
  excludeIds: WORDS.optional(),
  search: z.string().trim().max(160).optional(),
  years: RANGE.optional(),
  price: RANGE.optional(),
  kms: RANGE.optional()
})

export const ownerDealerFeedAdminSchemas = {
  owner_list_dealer_feed_links: z.strictObject({
    clientId: UUID.optional(),
    status: z.enum(['active', 'inactive']).optional()
  }),
  owner_upsert_dealer_feed_link: z.strictObject({
    clientId: UUID,
    externalOrgId: ORG_ID.optional(),
    sellerRefs: z.array(SELLER_REF).max(50),
    defaultFeedIds: z.array(FEED_ID).max(50).optional(),
    status: z.enum(['active', 'inactive']).default('active'),
    ack: z.literal(true)
  }),
  owner_deactivate_dealer_feed_link: z.strictObject({
    clientId: UUID,
    ack: z.literal(true)
  }),
  owner_inspect_org_feeds: z.strictObject({
    clientId: UUID.optional(),
    externalOrgId: ORG_ID.optional(),
    feedId: FEED_ID.optional(),
    includePreview: z.boolean().default(false),
    limit: z.number().int().min(1).max(50).default(25)
  }).refine(v => Boolean(v.clientId || v.externalOrgId), {
    message: 'clientId or externalOrgId is required'
  }),
  owner_discover_inventory_sellers: z.strictObject({
    clientId: UUID.optional(),
    externalOrgId: ORG_ID.optional(),
    makes: z.array(z.string().trim().min(1).max(80)).max(10).optional(),
    sellerIds: z.array(SELLER_REF).max(20).optional(),
    search: z.string().trim().min(1).max(120).optional(),
    limit: z.number().int().min(1).max(100).default(50)
  }).refine(v => Boolean(v.clientId || v.externalOrgId), {
    message: 'clientId or externalOrgId is required'
  }),
  owner_repair_feed_seller_scope: z.strictObject({
    clientId: UUID,
    feedId: FEED_ID,
    sellerIds: z.array(SELLER_REF).min(1).max(20),
    bindDefaultFeed: z.boolean().default(true),
    allowPreviewCountChange: z.boolean().default(false),
    ack: z.literal(true)
  }),
  owner_create_inventory_feed: z.strictObject({
    clientId: UUID,
    name: z.string().trim().min(1).max(160),
    platform: z.enum(['google', 'facebook']),
    filters: CREATE_FILTERS.default({}),
    sourceFeedId: FEED_ID.optional(),
    storeCode: z.string().trim().regex(/^[a-zA-Z0-9_-]{1,100}$/).optional(),
    storeAddress: z.string().trim().min(1).max(300).optional(),
    bindDefaultFeed: z.boolean().default(true),
    dryRun: z.boolean().default(false),
    ack: z.boolean().optional()
  }).refine(v => v.dryRun || v.ack === true, {
    message: 'ack:true is required unless dryRun:true'
  })
} as const

export type OwnerDealerFeedAdminToolName = keyof typeof ownerDealerFeedAdminSchemas

const ACTIVE_OWNER_SQL = 'SELECT email FROM team_members WHERE id = $1 AND is_active = TRUE AND user_role = \'owner\''

function stop(message: string, code = 'forbidden'): never {
  throw Object.assign(
    createError({ statusCode: 403, statusMessage: message }),
    { feedCode: code }
  )
}

function safeText(value: unknown): string | null {
  return typeof value === 'string'
    && !/https?:\/\/|token[=:]|secret[=:]|bearer\s/i.test(value)
    ? value.slice(0, 160)
    : null
}

function safeHost(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null
  try {
    const parsed = new URL(value.includes('://') ? value : `https://${value}`)
    if (!['http:', 'https:'].includes(parsed.protocol)) return null
    return parsed.hostname.toLowerCase()
  } catch {
    return null
  }
}

function sanitizeSourceSummary(source: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!source) return null
  let host: string | null = null
  let pathname: string | null = null
  if (typeof source.url === 'string') {
    try {
      const parsed = new URL(source.url)
      host = parsed.hostname.toLowerCase()
      pathname = parsed.pathname
    } catch {
      host = null
    }
  } else if (typeof source.baseUrl === 'string') {
    host = safeHost(source.baseUrl)
  }
  const req = source.requestConfig && typeof source.requestConfig === 'object' && !Array.isArray(source.requestConfig)
    ? source.requestConfig as Record<string, unknown>
    : null
  return {
    type: safeText(source.type),
    host,
    pathname: pathname ? pathname.slice(0, 120) : null,
    indexUid: safeText(req?.indexUid),
    label: safeText(source.label)
  }
}

function sanitizePlatformSettingsSummary(settings: Record<string, unknown>): Record<string, unknown> {
  const ext = settings.external && typeof settings.external === 'object' && !Array.isArray(settings.external)
    ? settings.external as Record<string, unknown>
    : null
  return {
    storeCode: safeText(settings.store_code),
    storeAddress: safeText(settings.store_address),
    websiteHost: safeHost(settings.website_domain) ?? safeHost(settings.channel_link),
    fbPageId: typeof settings.fb_page_id === 'string' && /^\d{1,30}$/.test(settings.fb_page_id) ? settings.fb_page_id : null,
    externalClientId: typeof ext?.clientId === 'string' && UUID.safeParse(ext.clientId).success ? ext.clientId : null
  }
}

function sanitizeFilterSummary(filters: Record<string, unknown>) {
  const stringArray = (v: unknown) => Array.isArray(v) ? v.map(String).slice(0, 50) : []
  const rulesetSellerIds = Array.isArray(filters.rulesets)
    ? filters.rulesets.map(r => (r && typeof r === 'object' ? String((r as Record<string, unknown>).sellerId ?? '') : ''))
    : undefined
  return {
    sellerIds: stringArray(filters.sellerIds),
    dealerIds: stringArray(filters.dealerIds),
    ...(rulesetSellerIds ? { rulesetSellerIds } : {}),
    condition: stringArray(filters.condition),
    makes: stringArray(filters.makes),
    models: stringArray(filters.models),
    onlyActive: typeof filters.onlyActive === 'boolean' ? filters.onlyActive : undefined,
    saleableOnly: typeof filters.saleableOnly === 'boolean' ? filters.saleableOnly : undefined,
    selectionMode: safeText(filters.selectionMode),
    includeIdsCount: Array.isArray(filters.includeIds) ? filters.includeIds.length : (filters.includeIds === undefined ? 0 : -1),
    manualIncludeIdsCount: Array.isArray(filters.manualIncludeIds) ? filters.manualIncludeIds.length : (filters.manualIncludeIds === undefined ? 0 : -1),
    filterGroupsCount: Array.isArray(filters.filterGroups) ? filters.filterGroups.length : 0
  }
}

export function diagnoseFeedOwnership(detail: FeedDetail, link: DealerLink): string[] {
  const reasons: string[] = []
  if (!link.externalOrgId) reasons.push('missing_external_org_id')
  if (!link.sellerRefs.length) reasons.push('missing_link_seller_refs')
  const f = detail.filters
  if (!f) {
    reasons.push('missing_filters')
    return reasons
  }
  if (f.manualIncludeIds !== undefined && !(Array.isArray(f.manualIncludeIds) && f.manualIncludeIds.length === 0)) {
    reasons.push('manual_include_ids_present')
  }
  if (f.includeIds !== undefined && !(Array.isArray(f.includeIds) && f.includeIds.length === 0)) {
    reasons.push('include_ids_present')
  }
  if (f.selectionMode !== undefined && f.selectionMode !== 'filters') {
    reasons.push('unsupported_selection_mode')
  }
  const owns = (s: unknown) => typeof s === 'string' && link.sellerRefs.includes(s)
  if (f.filterGroups !== undefined) {
    if (!Array.isArray(f.filterGroups)) {
      reasons.push('unsafe_filter_groups')
    } else if (f.filterGroups.some((g) => {
      if (!g || typeof g !== 'object' || Array.isArray(g)) return true
      const group = g as Record<string, unknown>
      if (group.mode !== undefined && group.mode !== 'criteria') return true
      if (group.includeIds !== undefined && !(Array.isArray(group.includeIds) && group.includeIds.length === 0)) return true
      return !Array.isArray(group.sellerIds) || group.sellerIds.length === 0 || !group.sellerIds.every(owns)
    })) {
      reasons.push('unsafe_filter_groups')
    }
  }
  const sellers = [...(Array.isArray(f.sellerIds) ? f.sellerIds : []), ...(Array.isArray(f.dealerIds) ? f.dealerIds : [])]
  if (sellers.some(s => !owns(s))) reasons.push('foreign_seller_id')
  if (Array.isArray(f.rulesets)) {
    if (!f.rulesets.length || !f.rulesets.every(r => r && typeof r === 'object' && owns((r as Record<string, unknown>).sellerId))) {
      reasons.push('ruleset_seller_mismatch')
    }
  } else if (!sellers.length) {
    reasons.push('missing_seller_ids')
  }
  if (!isBareNativeFeedSource(detail.source)) {
    if (!link.defaultFeedIds.includes(detail.id)) reasons.push('not_in_default_feed_ids')
    if (!isScopedDepartmentFeed({ ...detail, filters: { sellerIds: link.sellerRefs.slice(0, 1) } }, { ...link, defaultFeedIds: [...new Set([...link.defaultFeedIds, detail.id])] })) {
      reasons.push('unsupported_supplier_source')
    }
  }
  return reasons
}

function runtimeEnv(ctx: ToolContext): Record<string, string | undefined> {
  const binding = ctx.event.context.cloudflare?.env as Record<string, string | undefined> | undefined
  return binding === undefined ? process.env : binding
}

async function requireActiveOwner(ctx: ToolContext): Promise<ToolContext & { userEmail: string }> {
  if (!isActiveGodModeAuthority(getMcpRequestGodModeAuthority(ctx.event, ctx.userId), ctx.userId)) {
    stop('Verified owner MCP request required.', 'forbidden')
  }
  const actor = await queryOneFresh<{ email: string }>(ACTIVE_OWNER_SQL, [ctx.userId])
  if (!actor?.email) stop('Active owner identity required.', 'forbidden')
  return { ...ctx, userEmail: actor.email }
}

async function lockActiveOwner(db: { query: (sql: string, args: unknown[]) => Promise<{ rows: unknown[] }> }, userId: string) {
  if (!(await db.query(`${ACTIVE_OWNER_SQL} FOR SHARE`, [userId])).rows.length) {
    stop('Active owner required.', 'forbidden')
  }
}

async function requireActiveClient(clientId: string) {
  const row = await queryOneFresh<{ id: string, name: string }>(
    'SELECT id, name FROM agency_clients WHERE id = $1 AND is_active = TRUE',
    [clientId]
  )
  if (!row) stop('Active client not found.', 'not_found')
  return row
}

async function requireSocialDashboard(ctx: ToolContext) {
  const env = runtimeEnv(ctx)
  if (!isDealerFeedsEnabled(env)) stop('Dealer feeds are disabled.', 'disabled')
  const client = await getSocialDashboardClient({ env, runtimeEnv: env, queryOne: queryOneFresh })
  if (!client) stop('Dealer feed provider is not configured.', 'not_ready')
  return client
}

function requireWriteCoordinator(ctx: ToolContext, services?: TrustedSupplementalExecutionServices): TrustedSupplementalExecutionServices {
  if (!services || !/^mcp:[0-9a-f]{64}$/.test(ctx.godModeExecutionKey ?? '')) {
    stop('Owner execution coordinator required.', 'coordinator_required')
  }
  return services
}

function transactionalQueryOne(db: { query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }> }) {
  return async <T = unknown>(sql: string, params: unknown[] = []): Promise<T | null> => {
    const result = await db.query(sql, params)
    return (result.rows[0] as T | undefined) ?? null
  }
}

async function rawPreview(
  sdClient: Awaited<ReturnType<typeof requireSocialDashboard>>,
  providerContext: { actingUserEmail: string, externalOrgId: string },
  filters: Record<string, unknown>,
  detail?: FeedDetail,
  limit = 5
) {
  const body: Record<string, unknown> = { filters, limit, offset: 0 }
  if (detail) {
    body.validateForFeed = {
      feedType: detail.platform,
      mappings: detail.mappings,
      platformSettings: detail.platformSettings,
      source: detail.source ?? undefined
    }
  }
  const r = await sdClient.call<Record<string, unknown>>(providerContext, 'POST', '/api/feeds/preview', body)
  const items = Array.isArray(r.items) ? r.items as Array<Record<string, unknown>> : []
  const sampleSellerIds = Array.from(new Set(
    items.map(i => (typeof i.seller_id === 'string' && i.seller_id.trim() ? i.seller_id.trim() : null)).filter((v): v is string => Boolean(v))
  ))
  const matchedTotal = Number(r.matchedTotal ?? r.matched_total ?? r.total ?? 0)
  const validatedTotal = Number(r.validatedTotal ?? r.validated_total ?? items.length)
  const invalidTotal = Number(r.invalidTotal ?? r.invalid_total ?? Math.max(matchedTotal - validatedTotal, 0))
  return { matchedTotal, validatedTotal, invalidTotal, sampleSellerIds, items }
}

export async function runOwnerDealerFeedAdminOperation(
  name: OwnerDealerFeedAdminToolName,
  raw: unknown,
  initial: ToolContext,
  services?: TrustedSupplementalExecutionServices
): Promise<ToolResult> {
  try {
    const ctx = await requireActiveOwner(initial)
    const schema = ownerDealerFeedAdminSchemas[name]
    const parsed = schema.safeParse(raw)
    if (!parsed.success) return fail('Invalid owner dealer-feed admin arguments.', 'bad_args')

    if (name === 'owner_list_dealer_feed_links') {
      const input = parsed.data as z.infer<typeof ownerDealerFeedAdminSchemas.owner_list_dealer_feed_links>
      const links = await listDealerLinks({
        clientId: input.clientId,
        status: input.status ?? 'active',
        queryRows: queryRowsFresh
      })
      return ok({ links, count: links.length })
    }

    if (name === 'owner_upsert_dealer_feed_link') {
      const coord = requireWriteCoordinator(ctx, services)
      const input = parsed.data as z.infer<typeof ownerDealerFeedAdminSchemas.owner_upsert_dealer_feed_link>
      await requireActiveClient(input.clientId)
      const priorRow = await queryOneFresh<{
        client_id: string
        provider_id: string
        external_org_id: string
        seller_refs: unknown
        default_feed_ids: unknown
        status: string
      }>(
        `SELECT client_id, provider_id, external_org_id, seller_refs, default_feed_ids, status
           FROM client_feed_links WHERE client_id = $1 AND provider_id = $2`,
        [input.clientId, SOCIAL_DASHBOARD_PROVIDER_ID]
      )
      const existing = priorRow
        ? {
            clientId: String(priorRow.client_id),
            providerId: String(priorRow.provider_id),
            externalOrgId: String(priorRow.external_org_id),
            sellerRefs: Array.isArray(priorRow.seller_refs) ? priorRow.seller_refs.map(String) : [],
            defaultFeedIds: Array.isArray(priorRow.default_feed_ids) ? priorRow.default_feed_ids.map(String) : [],
            status: String(priorRow.status)
          }
        : null
      let externalOrgId = input.externalOrgId || existing?.externalOrgId || ''
      if (!externalOrgId) {
        const env = runtimeEnv(ctx)
        await coord.markDispatched()
        externalOrgId = await resolveDealerFeedOrganization({
          clientId: input.clientId,
          actingUserEmail: ctx.userEmail,
          sellerRefs: input.sellerRefs
        }, { queryOne: queryOneFresh, env, runtimeEnv: env })
      } else {
        await coord.markDispatched()
      }
      const link = await transactionWithoutRetry(async (db) => {
        await lockActiveOwner(db, ctx.userId)
        return await upsertDealerLink({
          clientId: input.clientId,
          providerId: SOCIAL_DASHBOARD_PROVIDER_ID,
          externalOrgId,
          sellerRefs: input.sellerRefs,
          defaultFeedIds: input.defaultFeedIds ?? existing?.defaultFeedIds ?? [],
          status: input.status
        }, { queryOne: transactionalQueryOne(db), actorId: ctx.userId })
      })
      return ok({ before: existing, after: link, authorization: 'active_owner' })
    }

    if (name === 'owner_deactivate_dealer_feed_link') {
      const coord = requireWriteCoordinator(ctx, services)
      const input = parsed.data as z.infer<typeof ownerDealerFeedAdminSchemas.owner_deactivate_dealer_feed_link>
      await coord.markDispatched()
      const link = await transactionWithoutRetry(async (db) => {
        await lockActiveOwner(db, ctx.userId)
        return await deactivateDealerLink(input.clientId, {
          queryOne: transactionalQueryOne(db),
          providerId: SOCIAL_DASHBOARD_PROVIDER_ID
        })
      })
      return ok({ link, authorization: 'active_owner' })
    }

    if (name === 'owner_inspect_org_feeds') {
      const input = parsed.data as z.infer<typeof ownerDealerFeedAdminSchemas.owner_inspect_org_feeds>
      let link: DealerLink | null = null
      if (input.clientId) {
        await requireActiveClient(input.clientId)
        link = await getDealerLink(input.clientId, SOCIAL_DASHBOARD_PROVIDER_ID, { queryOne: queryOneFresh })
      }
      const externalOrgId = input.externalOrgId || link?.externalOrgId
      if (!externalOrgId) stop('An active dealer link or explicit externalOrgId is required.', 'not_ready')
      const sdClient = await requireSocialDashboard(ctx)
      const provider = getFeedProvider(SOCIAL_DASHBOARD_PROVIDER_ID, { socialDashboardClient: sdClient })
      const providerContext = { actingUserEmail: ctx.userEmail, externalOrgId }
      const syntheticLink: DealerLink = link ?? {
        clientId: input.clientId ?? '',
        providerId: SOCIAL_DASHBOARD_PROVIDER_ID,
        externalOrgId,
        sellerRefs: [],
        defaultFeedIds: []
      }
      const list = await provider.listFeeds(providerContext, syntheticLink)
      const targets = input.feedId
        ? list.filter(f => f.id === input.feedId)
        : list.slice(0, input.limit)
      const feeds = []
      for (const summary of targets) {
        const detail = await provider.getFeed(providerContext, {
          providerId: SOCIAL_DASHBOARD_PROVIDER_ID,
          feedId: summary.id,
          platform: summary.platform
        })
        const scoped = link ? isScopedDepartmentFeed(detail, link) : null
        const diagnostics = link && !scoped ? diagnoseFeedOwnership(detail, link) : []
        let preview: Record<string, unknown> | undefined
        if (input.includePreview && input.feedId) {
          const current = await rawPreview(sdClient, providerContext, detail.filters, detail, 5)
          const withLinkSellers = link?.sellerRefs.length
            ? await rawPreview(sdClient, providerContext, { ...detail.filters, onlyActive: true, sellerIds: link.sellerRefs }, detail, 5)
            : null
          preview = {
            current: {
              matchedTotal: current.matchedTotal,
              validatedTotal: current.validatedTotal,
              invalidTotal: current.invalidTotal,
              sampleSellerIds: current.sampleSellerIds
            },
            ...(withLinkSellers
              ? {
                  withLinkSellerRefs: {
                    matchedTotal: withLinkSellers.matchedTotal,
                    validatedTotal: withLinkSellers.validatedTotal,
                    invalidTotal: withLinkSellers.invalidTotal,
                    sampleSellerIds: withLinkSellers.sampleSellerIds
                  }
                }
              : {})
          }
        }
        feeds.push({
          feedId: detail.id,
          name: safeText(detail.name),
          platform: detail.platform,
          isActive: detail.isActive,
          inDefaultFeedIds: link ? link.defaultFeedIds.includes(detail.id) : null,
          isScopedForClient: scoped,
          ownershipDiagnostics: diagnostics,
          filters: sanitizeFilterSummary(detail.filters),
          source: sanitizeSourceSummary(detail.source),
          platformSettings: sanitizePlatformSettingsSummary(detail.platformSettings),
          ...(preview ? { preview } : {})
        })
      }
      return ok({
        clientId: input.clientId ?? null,
        externalOrgId,
        linkSellerRefs: link?.sellerRefs ?? null,
        linkDefaultFeedIds: link?.defaultFeedIds ?? null,
        totalOrgFeeds: list.length,
        truncated: !input.feedId && list.length > input.limit,
        feeds
      })
    }

    if (name === 'owner_discover_inventory_sellers') {
      const input = parsed.data as z.infer<typeof ownerDealerFeedAdminSchemas.owner_discover_inventory_sellers>
      let externalOrgId = input.externalOrgId
      if (!externalOrgId && input.clientId) {
        await requireActiveClient(input.clientId)
        const link = await getDealerLink(input.clientId, SOCIAL_DASHBOARD_PROVIDER_ID, { queryOne: queryOneFresh })
        externalOrgId = link?.externalOrgId
      }
      if (!externalOrgId) stop('An active dealer link or explicit externalOrgId is required.', 'not_ready')
      const sdClient = await requireSocialDashboard(ctx)
      const providerContext = { actingUserEmail: ctx.userEmail, externalOrgId }
      const filters: Record<string, unknown> = { onlyActive: true }
      if (input.makes?.length) filters.makes = input.makes
      if (input.sellerIds?.length) filters.sellerIds = input.sellerIds
      if (input.search) filters.search = input.search
      const preview = await rawPreview(sdClient, providerContext, filters, undefined, input.limit)
      const bySeller = new Map<string, {
        sellerId: string
        sampleCount: number
        address: Record<string, string | null> | null
        makes: Set<string>
        models: Set<string>
      }>()
      for (const item of preview.items) {
        const sid = typeof item.seller_id === 'string' && item.seller_id.trim() ? item.seller_id.trim() : ''
        if (!sid) continue
        let entry = bySeller.get(sid)
        if (!entry) {
          const addr = item.address && typeof item.address === 'object' && !Array.isArray(item.address)
            ? item.address as Record<string, unknown>
            : null
          entry = {
            sellerId: sid,
            sampleCount: 0,
            address: addr
              ? {
                  line1: safeText(addr.line1),
                  suburb: safeText(addr.suburb),
                  state: safeText(addr.state),
                  postcode: safeText(addr.postcode)
                }
              : null,
            makes: new Set(),
            models: new Set()
          }
          bySeller.set(sid, entry)
        }
        entry.sampleCount++
        const make = safeText(item.make)
        const model = safeText(item.model)
        if (make) entry.makes.add(make)
        if (model) entry.models.add(model)
      }
      return ok({
        externalOrgId,
        matchedTotal: preview.matchedTotal,
        sampledItems: preview.items.length,
        sellers: [...bySeller.values()].map(s => ({
          sellerId: s.sellerId,
          sampleCount: s.sampleCount,
          address: s.address,
          makes: [...s.makes].slice(0, 10),
          models: [...s.models].slice(0, 10)
        }))
      })
    }

    if (name === 'owner_repair_feed_seller_scope') {
      const coord = requireWriteCoordinator(ctx, services)
      const input = parsed.data as z.infer<typeof ownerDealerFeedAdminSchemas.owner_repair_feed_seller_scope>
      await requireActiveClient(input.clientId)
      const link = await getDealerLink(input.clientId, SOCIAL_DASHBOARD_PROVIDER_ID, { queryOne: queryOneFresh })
      if (!link || !link.externalOrgId || !link.sellerRefs.length) {
        stop('An active dealer link with sellerRefs is required before repairing feed scope.', 'not_ready')
      }
      const allowed = new Set(link.sellerRefs)
      if (input.sellerIds.some(id => !allowed.has(id))) {
        stop('Every sellerId must already exist in the client dealer link sellerRefs.', 'bad_args')
      }
      const sdClient = await requireSocialDashboard(ctx)
      const provider = getFeedProvider(link.providerId, { socialDashboardClient: sdClient })
      const providerContext = linkToContext(link, ctx.userEmail)
      const list = await provider.listFeeds(providerContext, link)
      const summary = list.find(f => f.id === input.feedId)
      if (!summary) stop('Feed not found in the client organization.', 'not_found')
      const before = await provider.getFeed(providerContext, {
        providerId: link.providerId,
        feedId: input.feedId,
        platform: summary.platform
      })
      if (before.id !== input.feedId) stop('Feed identity mismatch.', 'not_found')

      const nextFilters = { ...before.filters, sellerIds: input.sellerIds }
      const previewBefore = await rawPreview(sdClient, providerContext, before.filters, before, 3)
      const previewAfter = await rawPreview(sdClient, providerContext, { ...nextFilters, onlyActive: true }, before, 3)
      if (!input.allowPreviewCountChange && previewBefore.matchedTotal !== previewAfter.matchedTotal) {
        return fail(
          `Preview matched count would change from ${previewBefore.matchedTotal} to ${previewAfter.matchedTotal}; verify sellerIds or pass allowPreviewCountChange:true.`,
          'preview_count_changed'
        )
      }

      await transactionWithoutRetry(async (db) => {
        await lockActiveOwner(db, ctx.userId)
      })
      await coord.markDispatched()
      await provider.updateFeed(providerContext, {
        providerId: link.providerId,
        feedId: before.id,
        platform: before.platform
      }, { filters: nextFilters })

      let updatedDefaultFeedIds = link.defaultFeedIds
      if (input.bindDefaultFeed && !link.defaultFeedIds.includes(before.id)) {
        updatedDefaultFeedIds = [...new Set([...link.defaultFeedIds, before.id])]
        await transactionWithoutRetry(async (db) => {
          await lockActiveOwner(db, ctx.userId)
          await db.query(
            `UPDATE client_feed_links SET default_feed_ids = $3::jsonb, updated_at = NOW()
              WHERE client_id = $1 AND provider_id = $2 AND status = 'active'`,
            [link.clientId, link.providerId, JSON.stringify(updatedDefaultFeedIds)]
          )
        })
      }

      const after = await provider.getFeed(providerContext, {
        providerId: link.providerId,
        feedId: before.id,
        platform: before.platform
      })
      const updatedLink: DealerLink = { ...link, defaultFeedIds: updatedDefaultFeedIds }
      const scopedNow = isScopedDepartmentFeed(after, updatedLink)
      return ok({
        clientId: input.clientId,
        feedId: after.id,
        name: safeText(after.name),
        platform: after.platform,
        filtersBefore: sanitizeFilterSummary(before.filters),
        filtersAfter: sanitizeFilterSummary(after.filters),
        defaultFeedIds: updatedDefaultFeedIds,
        isScopedForClient: scopedNow,
        ownershipDiagnostics: scopedNow ? [] : diagnoseFeedOwnership(after, updatedLink),
        previewBefore: { matchedTotal: previewBefore.matchedTotal, validatedTotal: previewBefore.validatedTotal, invalidTotal: previewBefore.invalidTotal },
        previewAfter: { matchedTotal: previewAfter.matchedTotal, validatedTotal: previewAfter.validatedTotal, invalidTotal: previewAfter.invalidTotal },
        readbackVerified: true,
        authorization: 'active_owner'
      })
    }

    // owner_create_inventory_feed
    const input = parsed.data as z.infer<typeof ownerDealerFeedAdminSchemas.owner_create_inventory_feed>
    await requireActiveClient(input.clientId)
    const link = await getDealerLink(input.clientId, SOCIAL_DASHBOARD_PROVIDER_ID, { queryOne: queryOneFresh })
    if (!link || !link.externalOrgId || !link.sellerRefs.length) {
      stop('An active dealer link with sellerRefs is required before creating a feed.', 'not_ready')
    }
    const sdClient = await requireSocialDashboard(ctx)
    const provider = getFeedProvider(link.providerId, { socialDashboardClient: sdClient })
    const providerContext = linkToContext(link, ctx.userEmail)

    let template: FeedDetail | null = null
    if (input.sourceFeedId) {
      if (!link.defaultFeedIds.includes(input.sourceFeedId)) {
        stop('Source template must be listed in the client defaultFeedIds.', 'not_found')
      }
      const list = await provider.listFeeds(providerContext, link)
      const match = list.find(f => f.id === input.sourceFeedId)
      if (!match) stop('Source template feed not found in organization.', 'not_found')
      template = await provider.getFeed(providerContext, {
        providerId: link.providerId,
        feedId: input.sourceFeedId,
        platform: match.platform
      })
    }

    const filters = buildInventoryPreviewFilters(normalizeDealerFeedFilters(input.filters), link.sellerRefs)
    const platformSettings: Record<string, unknown> = {
      ...(input.storeCode ? { store_code: input.storeCode } : {}),
      ...(input.storeAddress ? { store_address: input.storeAddress } : {})
    }
    const spec = {
      name: input.name,
      platform: input.platform as FeedPlatform,
      filters,
      mappings: template?.mappings ?? {},
      platformSettings,
      source: template?.source ?? undefined
    }
    const preview = await provider.previewInventory(providerContext, link, spec, { limit: 100, offset: 0 })
    const readiness = summarizeFeedReadiness(preview.validation)
    const previewSummary = {
      matchedItemCount: preview.validation?.matchedTotal ?? preview.total,
      eligibleItemCount: preview.validation?.validatedTotal ?? preview.items.length,
      readinessStatus: readiness.status,
      invalidTotal: preview.validation?.invalidTotal ?? 0
    }
    if (input.dryRun) {
      return ok({
        dryRun: true,
        clientId: input.clientId,
        name: input.name,
        platform: input.platform,
        filters: sanitizeFilterSummary(filters),
        source: sanitizeSourceSummary(template?.source ?? null),
        preview: previewSummary
      })
    }

    const coord = requireWriteCoordinator(ctx, services)
    await transactionWithoutRetry(async (db) => {
      await lockActiveOwner(db, ctx.userId)
    })
    await coord.markDispatched()
    const created = await provider.createFeed(providerContext, link, {
      ...spec,
      externalKey: `owner-feed:${ctx.godModeExecutionKey}`
    })
    if (!FEED_ID.safeParse(created.feedId).success) {
      stop('Provider returned an invalid feed identity.', 'reconciliation_required')
    }
    let updatedDefaultFeedIds = link.defaultFeedIds
    if (input.bindDefaultFeed || template?.source) {
      updatedDefaultFeedIds = [...new Set([...link.defaultFeedIds, created.feedId])]
      await transactionWithoutRetry(async (db) => {
        await lockActiveOwner(db, ctx.userId)
        await db.query(
          `UPDATE client_feed_links SET default_feed_ids = $3::jsonb, updated_at = NOW()
            WHERE client_id = $1 AND provider_id = $2 AND status = 'active'`,
          [link.clientId, link.providerId, JSON.stringify(updatedDefaultFeedIds)]
        )
      })
    }
    const readback = await provider.getFeed(providerContext, created)
    const updatedLink: DealerLink = { ...link, defaultFeedIds: updatedDefaultFeedIds }
    return ok({
      clientId: input.clientId,
      feedId: readback.id,
      name: safeText(readback.name),
      platform: readback.platform,
      isActive: readback.isActive,
      defaultFeedIds: updatedDefaultFeedIds,
      isScopedForClient: isScopedDepartmentFeed(readback, updatedLink),
      preview: previewSummary,
      readbackVerified: true,
      providerDeliveryVerified: false,
      authorization: 'active_owner'
    })
  } catch (error) {
    const safe = error as { feedCode?: string, statusMessage?: string }
    return fail(
      safe.feedCode ? safe.statusMessage! : 'Owner dealer-feed admin operation unavailable or not permitted.',
      safe.feedCode ?? 'unavailable'
    )
  }
}
