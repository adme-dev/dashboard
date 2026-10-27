import { socialCapabilityReadiness, type StaffSocialAvailability, type OperationReadiness } from './capabilityReadiness'
import { resolveEffectiveSocialTargets, tikTokConsentIdentity } from './effectivePayload'
import { buildSocialPostSnapshot } from './revisions'
import { hasWriteScope } from '~~/server/utils/ai/mcp/scope'
// server/utils/socialPublishing/drafts.ts
// Scoped draft services for delegated (staff / MCP) social publishing.
//
// The caller supplies a trusted actor whose client coverage was freshly resolved (Task 1
// resolveMcpStaffContext); nothing here trusts a model-supplied role, status, policy or URL. Every
// account / media / post query is filtered to an authorized client BEFORE detail, pagination or any
// credential-bearing column is read, and no access/refresh token ever leaves this module. Drafts
// created here are server-marked `review_policy = 'delegated_marketing'`: a staff `scheduledAt` is
// intent only and the row stays `draft` until a separate owner/admin approves an exact revision.
import { createError, type H3Event } from 'h3'
import { queryOneFresh, queryRowsFresh } from '~~/server/utils/db'
import type { ToolContext } from '~~/server/utils/ai/toolContext'
import { classifySocialPublishingAccountHealth } from '~~/server/utils/socialPublishing/accountHealth'
import {
  normalizePlatformOverrides,
  normalizePublishingTargets,
  normalizeScheduledAt
} from '~~/server/utils/socialPublishing/guards'
import {
  listClientSocialMediaAssets,
  normalizeSocialMediaAssetRefs,
  resolveSocialMediaAssets,
  type SocialMediaAssetKind,
  type SocialMediaAssetPage
} from '~~/server/utils/socialPublishing/mediaAssets'
import {
  DELEGATED_SOCIAL_PLATFORMS,
  SOCIAL_POST_CONTENT_LOCKED_STATUSES,
  arrayValue,
  objectValue,
  socialRevisionView,
  socialWorkflowStatus,
  supersedeLiveSocialRevisions,
  toIsoOrNull,
  type SocialRevisionRow,
  type SocialTxDb
} from '~~/server/utils/socialPublishing/revisions'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DELEGATED_PLATFORM_SET = new Set<string>(DELEGATED_SOCIAL_PLATFORMS)
const LOCKED = new Set<string>(SOCIAL_POST_CONTENT_LOCKED_STATUSES)
const MAX_CONTENT = 10_000
const MAX_FIRST_COMMENT = 2_200
const MAX_HASHTAGS = 30
const MAX_LINK = 2_000

export interface SocialDraftActor {
  actorId: string
  /** Freshly authorized clients; null = all ACTIVE clients (fresh MANAGEMENT/ADMIN only). */
  clientIds: readonly string[] | null
  event: H3Event
  availability?: StaffSocialAvailability
}

export interface SocialDraftDb {
  queryRows: <T>(sql: string, params?: unknown[]) => Promise<T[]>
  queryOne: <T>(sql: string, params?: unknown[]) => Promise<T | null>
}

const defaultDb: SocialDraftDb = {
  queryRows: queryRowsFresh as SocialDraftDb['queryRows'],
  queryOne: queryOneFresh as SocialDraftDb['queryOne']
}

function notFound(what: string): never {
  throw createError({ statusCode: 404, statusMessage: `${what} not found` })
}

function badRequest(message: string): never {
  throw createError({ statusCode: 400, statusMessage: message })
}

/** Derive the trusted draft actor from a fresh MCP staff context (never from model input). */
export function socialDraftActorFromToolContext(ctx: ToolContext): SocialDraftActor {
  if (ctx.mcpStaffAuthority !== 'fresh' || !ctx.assistantScope) {
    throw createError({ statusCode: 403, statusMessage: 'Fresh staff authority required' })
  }
  let clientIds: string[] | null = ctx.assistantScope.clientAccessMode === 'all_active'
    ? null
    : [...ctx.assistantScope.assignedClientIds]
  if (ctx.clientScope) clientIds = clientIds === null || clientIds.includes(ctx.clientScope) ? [ctx.clientScope] : []
  const scopes = ctx.mcpScopes instanceof Set ? ctx.mcpScopes : new Set(ctx.mcpScopes ?? [])
  return { actorId: ctx.userId, clientIds, event: ctx.event, availability: {
    clientMapped: true, socialDraft: (ctx.marketingCapabilities ?? []).includes('social_draft') && ctx.assistantReadOnly !== true,
    reporting: (ctx.marketingCapabilities ?? []).includes('reporting'), signedRead: scopes.has('mcp:read'), signedWrite: hasWriteScope(scopes)
  } }
}

/** Authorize one client for the actor before any client data is read. Unknown and forbidden look alike. */
export async function assertDraftClient(actor: SocialDraftActor, clientId: unknown, db: SocialDraftDb = defaultDb): Promise<string> {
  if (typeof clientId !== 'string' || !UUID.test(clientId)) notFound('Client')
  const id = clientId.toLowerCase()
  if (actor.clientIds !== null && !actor.clientIds.includes(id)) notFound('Client')
  const row = await db.queryOne<{ id: string }>('SELECT id FROM agency_clients WHERE id = $1 AND is_active = TRUE', [id])
  if (!row) notFound('Client')
  return id
}

// ---------------------------------------------------------------------------------------------------
// Discovery

export interface ScopedAccountSummary {
  id: string
  platform: string
  platformAccountId: string
  name: string | null
  health: string
  healthReason: string | null
  publishReady: boolean
  unavailableReason: string | null
  operations?: OperationReadiness[]
  linkedinAuthorType?: 'organization' | 'person'
}

interface AccountRow {
  id: string
  platform: string
  platform_account_id: string
  account_name: string | null
  is_active: boolean | null
  last_error: string | null
  token_expires_at: string | null
  linked_facebook_account_id?: string | null
  linked_facebook_is_active?: boolean | null
  has_refresh_token: boolean | null
  metadata: unknown
}

export async function listSocialPublishingAccounts(
  actor: SocialDraftActor,
  input: { clientId: string },
  db: SocialDraftDb = defaultDb
): Promise<ScopedAccountSummary[]> {
  const clientId = await assertDraftClient(actor, input.clientId, db)
  const rows = await db.queryRows<AccountRow>(
    `SELECT id, platform, platform_account_id, account_name, is_active, last_error, token_expires_at, metadata,
            (NULLIF(refresh_token, '') IS NOT NULL) AS has_refresh_token,
            (SELECT fb.id FROM social_accounts fb WHERE fb.client_id=a.client_id AND fb.platform='facebook' AND fb.platform_account_id=a.metadata->>'via_page_id' LIMIT 1) AS linked_facebook_account_id,
            (SELECT fb.is_active FROM social_accounts fb WHERE fb.client_id=a.client_id AND fb.platform='facebook' AND fb.platform_account_id=a.metadata->>'via_page_id' LIMIT 1) AS linked_facebook_is_active
       FROM social_accounts a
      WHERE client_id = $1 AND platform = ANY($2::text[])
      ORDER BY platform, account_name NULLS LAST, id
      LIMIT 100`,
    [clientId, [...DELEGATED_SOCIAL_PLATFORMS]]
  )
  return rows.map((row) => {
    const metadata = objectValue(row.metadata)
    const health = classifySocialPublishingAccountHealth({
      platform: row.platform,
      isActive: row.is_active !== false,
      lastError: row.last_error,
      tokenExpiresAt: row.token_expires_at,
      hasRefreshToken: Boolean(row.has_refresh_token),
      metadata, linkedFacebookAccountId: row.linked_facebook_account_id, linkedFacebookIsActive: row.linked_facebook_is_active
    })
    const operations = socialCapabilityReadiness({ platform: row.platform, isActive: row.is_active !== false,
      lastError: row.last_error, tokenExpiresAt: row.token_expires_at, hasRefreshToken: Boolean(row.has_refresh_token), metadata, linkedFacebookAccountId: row.linked_facebook_account_id, linkedFacebookIsActive: row.linked_facebook_is_active }, actor.availability)
    const readiness = operations.find(operation => operation.operation === 'organic_publish')!

    const unavailableReason = row.is_active === false
      ? 'Account is disconnected'
      : health.requiresReconnect || health.health === 'reconnect'
        ? 'Account requires reconnect in the dashboard'
        : readiness.state === 'available' ? null : readiness.reason
    return {
      id: row.id,
      platform: row.platform,
      platformAccountId: row.platform_account_id,
      name: row.account_name,
      health: health.health,
      healthReason: health.healthReason,
      operations,
      publishReady: !unavailableReason,
      unavailableReason: unavailableReason ?? null,
      ...(row.platform === 'linkedin'
        ? { linkedinAuthorType: metadata.linkedinAuthorType === 'person' ? 'person' as const : 'organization' as const }
        : {})
    }
  })
}

export async function listSocialMediaAssets(
  actor: SocialDraftActor,
  input: { clientId: string, kind?: SocialMediaAssetKind, limit?: number, cursor?: string | null },
  db: SocialDraftDb = defaultDb
): Promise<SocialMediaAssetPage> {
  const clientId = await assertDraftClient(actor, input.clientId, db)
  return await listClientSocialMediaAssets({ clientId, kind: input.kind, limit: input.limit, cursor: input.cursor, db })
}

// ---------------------------------------------------------------------------------------------------
// Draft create / update

export interface SocialDraftInput {
  targets?: unknown
  content?: unknown
  platformOverrides?: unknown
  linkUrl?: unknown
  hashtags?: unknown
  firstComment?: unknown
  mediaAssets?: unknown
  scheduledAt?: unknown
  timezone?: unknown
  campaignId?: unknown
  packageAssignmentId?: unknown
}

const DRAFT_FIELDS = new Set<keyof SocialDraftInput>([
  'targets', 'content', 'platformOverrides', 'linkUrl', 'hashtags', 'firstComment',
  'mediaAssets', 'scheduledAt', 'timezone', 'campaignId', 'packageAssignmentId'
])

interface NormalizedDraftFields {
  publish_targets?: string
  platforms?: string[]
  account_ids?: string[]
  content?: string
  platform_overrides?: string
  link_url?: string | null
  hashtags?: string[] | null
  first_comment?: string | null
  media_asset_refs?: string
  scheduled_at?: string | null
  timezone?: string
  campaign_id?: string | null
  packageAssignmentId?: string | null
}

function optionalText(value: unknown, label: string, max: number): string | null {
  if (value == null || value === '') return null
  if (typeof value !== 'string') badRequest(`Invalid ${label}`)
  const text = value.trim()
  if (text.length > max) badRequest(`${label} is too long`)
  return text || null
}

function normalizeLink(value: unknown): string | null {
  const text = optionalText(value, 'linkUrl', MAX_LINK)
  if (!text) return null
  try {
    const url = new URL(text)
    if ((url.protocol !== 'https:' && url.protocol !== 'http:') || url.username || url.password) throw new Error('bad')
    return url.toString()
  } catch {
    return badRequest('linkUrl must be an http(s) URL')
  }
}

function normalizeHashtags(value: unknown): string[] | null {
  if (value == null) return null
  if (!Array.isArray(value) || value.length > MAX_HASHTAGS) badRequest(`hashtags can contain at most ${MAX_HASHTAGS} items`)
  const tags = [...new Set(value.map((tag) => {
    if (typeof tag !== 'string') badRequest('Invalid hashtag')
    const text = tag.trim().replace(/^#+/, '')
    if (!text || text.length > 100 || /\s/.test(text)) badRequest('Invalid hashtag')
    return text
  }))]
  return tags.length ? tags : null
}

function normalizeTimezone(value: unknown): string {
  if (value == null || value === '') return 'Australia/Sydney'
  if (typeof value !== 'string' || value.length > 64) badRequest('Invalid timezone')
  try {
    new Intl.DateTimeFormat('en-AU', { timeZone: value }).format(0)
  } catch {
    badRequest('Invalid timezone')
  }
  return value
}

async function normalizeDraftFields(
  actor: SocialDraftActor,
  clientId: string,
  input: SocialDraftInput,
  db: SocialDraftDb
): Promise<NormalizedDraftFields> {
  for (const key of Object.keys(input)) {
    if (!DRAFT_FIELDS.has(key as keyof SocialDraftInput)) badRequest(`Unsupported draft field: ${key}`)
  }
  const out: NormalizedDraftFields = {}
  if ('targets' in input) {
    const targets = await normalizePublishingTargets(clientId, input.targets, { queryRows: db.queryRows })
    if (!targets?.targets.length) badRequest('Choose at least one exact publishing account')
    for (const target of targets.targets) {
      if (!DELEGATED_PLATFORM_SET.has(target.platform)) badRequest(`${target.platform} is not available for delegated drafts`)
    }
    out.publish_targets = JSON.stringify(targets.targets)
    out.platforms = targets.platforms
    out.account_ids = targets.accountIds
  }
  if ('content' in input) out.content = optionalText(input.content, 'content', MAX_CONTENT) ?? ''
  if ('platformOverrides' in input) {
    const overrides = normalizePlatformOverrides(input.platformOverrides ?? {})
    for (const [platform, override] of Object.entries(overrides)) {
      if (!DELEGATED_PLATFORM_SET.has(platform)) badRequest(`${platform} is not available for delegated drafts`)
      if (override.mediaUrls?.length) badRequest('Delegated drafts use mediaAssets, not media URLs')
    }
    out.platform_overrides = JSON.stringify(overrides)
  }
  if ('linkUrl' in input) out.link_url = normalizeLink(input.linkUrl)
  if ('hashtags' in input) out.hashtags = normalizeHashtags(input.hashtags)
  if ('firstComment' in input) out.first_comment = optionalText(input.firstComment, 'firstComment', MAX_FIRST_COMMENT)
  if ('mediaAssets' in input) {
    const refs = normalizeSocialMediaAssetRefs(input.mediaAssets)
    // Ownership + existence now (fail early); the content identity is captured at submission.
    await resolveSocialMediaAssets({ event: actor.event, clientId, refs })
    out.media_asset_refs = JSON.stringify(refs)
  }
  if ('scheduledAt' in input) {
    const scheduled = normalizeScheduledAt(input.scheduledAt)
    if (scheduled && Date.parse(scheduled) <= Date.now()) badRequest('scheduledAt must be in the future')
    out.scheduled_at = scheduled
  }
  if ('timezone' in input) out.timezone = normalizeTimezone(input.timezone)
  if ('campaignId' in input) {
    if (input.campaignId == null || input.campaignId === '') {
      out.campaign_id = null
    } else {
      if (typeof input.campaignId !== 'string' || !UUID.test(input.campaignId)) badRequest('Invalid campaignId')
      const campaign = await db.queryOne('SELECT id FROM social_campaigns WHERE id = $1 AND client_id = $2', [input.campaignId, clientId])
      if (!campaign) notFound('Campaign')
      out.campaign_id = input.campaignId.toLowerCase()
    }
  }
  if ('packageAssignmentId' in input) {
    if (input.packageAssignmentId == null || input.packageAssignmentId === '') {
      out.packageAssignmentId = null
    } else {
      if (typeof input.packageAssignmentId !== 'string' || !UUID.test(input.packageAssignmentId)) badRequest('Invalid packageAssignmentId')
      const assignment = await db.queryOne(
        `SELECT id FROM social_content_package_assignments
          WHERE id = $1 AND client_id = $2 AND status = 'active'
            AND starts_on <= CURRENT_DATE AND (ends_on IS NULL OR ends_on >= CURRENT_DATE)`,
        [input.packageAssignmentId, clientId]
      )
      if (!assignment) notFound('Package assignment')
      out.packageAssignmentId = input.packageAssignmentId.toLowerCase()
    }
  }
  return out
}

export async function bindTikTokDraftConsent(actor: SocialDraftActor, post: any, patch: SocialDraftInput, tx: SocialTxDb, initialCreation = false) {
  const targets = arrayValue<any>(post.publish_targets)
  if (!targets.some(t => t.platform === 'tiktok')) return
  const media = await resolveSocialMediaAssets({ event: actor.event, clientId: post.client_id, refs: arrayValue(post.media_asset_refs) })
  const effective = resolveEffectiveSocialTargets(buildSocialPostSnapshot(post, media), media)
  for (const target of targets.filter(t => t.platform === 'tiktok')) {
    const payload = effective.find(t => t.accountId === target.accountId && t.platform === 'tiktok')!
    const account = (await tx.query('SELECT platform_account_id FROM social_accounts WHERE id=$1 AND client_id=$2 AND platform=\'tiktok\' AND is_active=TRUE', [target.accountId, post.client_id])).rows[0]
    if (!account) badRequest('TikTok account unavailable')
    const supplied = arrayValue<any>(patch.targets).find(t => t.platform === 'tiktok' && t.accountId === target.accountId)?.options
      ?? objectValue(objectValue(patch.platformOverrides).tiktok).options
    payload.options = { ...payload.options, consentAccountId: account.platform_account_id }
    const identity = tikTokConsentIdentity(payload, media)
    const renewed = supplied?.consent === true && (supplied.consentPayload === identity || (initialCreation && !supplied.consentPayload))
    const valid = supplied?.consent !== false && payload.options.consent === true && (renewed || payload.options.consentPayload === identity)
    target.options = { ...payload.options, consent: valid, ...(valid ? { consentPayload: identity } : {}) }
    if (!valid) delete target.options.consentPayload
  }
  await tx.query('UPDATE social_posts SET publish_targets=$2::jsonb WHERE id=$1', [post.id, JSON.stringify(targets)])
}

export interface CreateSocialDraftInput extends SocialDraftInput {
  clientId: string
}

export async function createSocialPostDraft(
  actor: SocialDraftActor,
  input: CreateSocialDraftInput,
  tx: SocialTxDb,
  db: SocialDraftDb = defaultDb
): Promise<SocialPostStatusView> {
  const { clientId: rawClientId, ...fields } = input
  const clientId = await assertDraftClient(actor, rawClientId, db)
  if (!('targets' in fields)) badRequest('targets required')
  const normalized = await normalizeDraftFields(actor, clientId, fields, db)
  const metadata: Record<string, unknown> = { source: 'mcp_marketing_draft' }
  if (normalized.packageAssignmentId) metadata.socialPackageAssignmentId = normalized.packageAssignmentId
  const inserted = await tx.query(
    `INSERT INTO social_posts (
       client_id, created_by, content, media_urls, link_url, hashtags, first_comment, platforms, account_ids,
       publish_targets, platform_overrides, scheduled_at, timezone, status, metadata, campaign_id,
       review_policy, media_asset_refs
     ) VALUES ($1, $2, $3, NULL, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb, $11, $12, 'draft', $13::jsonb, $14,
       'delegated_marketing', $15::jsonb)
     RETURNING id`,
    [
      clientId,
      actor.actorId,
      normalized.content ?? '',
      normalized.link_url ?? null,
      normalized.hashtags ?? null,
      normalized.first_comment ?? null,
      normalized.platforms ?? [],
      normalized.account_ids ?? null,
      normalized.publish_targets ?? '[]',
      normalized.platform_overrides ?? '{}',
      normalized.scheduled_at ?? null,
      normalized.timezone ?? 'Australia/Sydney',
      JSON.stringify(metadata),
      normalized.campaign_id ?? null,
      normalized.media_asset_refs ?? '[]'
    ]
  )
  const id = inserted.rows[0]?.id as string | undefined
  if (!id) throw new Error('Social draft was not created')
  const created = (await tx.query('SELECT * FROM social_posts WHERE id=$1', [id])).rows[0]
  await bindTikTokDraftConsent(actor, created, fields, tx, true)
  await tx.query(
    `INSERT INTO social_publishing_audit_events (client_id, post_id, actor_id, action, metadata)
     VALUES ($1, $2, $3, 'post_created', $4::jsonb)`,
    [clientId, id, actor.actorId, JSON.stringify({ source: 'mcp', reviewPolicy: 'delegated_marketing', platforms: normalized.platforms ?? [] })]
  )
  return await getSocialPostStatus(actor, id, tx)
}

/**
 * Edit the actor's own delegated draft. Any change invalidates review: live revisions are superseded,
 * approval and client-approval bindings are cleared and the post returns to `draft`.
 */
export async function updateSocialPostDraft(
  actor: SocialDraftActor,
  postId: string,
  patch: SocialDraftInput,
  tx: SocialTxDb,
  db: SocialDraftDb = defaultDb
): Promise<SocialPostStatusView> {
  if (typeof postId !== 'string' || !UUID.test(postId)) notFound('Post')
  const locked = await tx.query(
    `SELECT id, client_id, created_by, status, review_policy, metadata
       FROM social_posts WHERE id = $1 FOR UPDATE`,
    [postId]
  )
  const post = locked.rows[0]
  if (!post || (actor.clientIds !== null && !actor.clientIds.includes(post.client_id))) notFound('Post')
  await assertDraftClient(actor, post.client_id, db)
  if (post.review_policy !== 'delegated_marketing' || post.created_by !== actor.actorId) notFound('Post')
  if (LOCKED.has(post.status)) {
    throw createError({ statusCode: 409, statusMessage: `Cannot edit a ${post.status} post` })
  }
  if (!patch || typeof patch !== 'object' || !Object.keys(patch).length) badRequest('No updatable fields provided')
  const normalized = await normalizeDraftFields(actor, post.client_id, patch, db)

  const sets: string[] = []
  const params: unknown[] = []
  const set = (column: string, value: unknown, cast = '') => {
    params.push(value)
    sets.push(`${column} = $${params.length}${cast}`)
  }
  if (normalized.publish_targets !== undefined) {
    set('publish_targets', normalized.publish_targets, '::jsonb')
    set('platforms', normalized.platforms)
    set('account_ids', normalized.account_ids)
  }
  if (normalized.content !== undefined) set('content', normalized.content)
  if (normalized.platform_overrides !== undefined) set('platform_overrides', normalized.platform_overrides, '::jsonb')
  if (normalized.link_url !== undefined) set('link_url', normalized.link_url)
  if (normalized.hashtags !== undefined) set('hashtags', normalized.hashtags)
  if (normalized.first_comment !== undefined) set('first_comment', normalized.first_comment)
  if (normalized.media_asset_refs !== undefined) set('media_asset_refs', normalized.media_asset_refs, '::jsonb')
  if (normalized.scheduled_at !== undefined) set('scheduled_at', normalized.scheduled_at)
  if (normalized.timezone !== undefined) set('timezone', normalized.timezone)
  if (normalized.campaign_id !== undefined) set('campaign_id', normalized.campaign_id)
  if (normalized.packageAssignmentId !== undefined) {
    const metadata = { ...objectValue(post.metadata) }
    if (normalized.packageAssignmentId) metadata.socialPackageAssignmentId = normalized.packageAssignmentId
    else delete metadata.socialPackageAssignmentId
    set('metadata', JSON.stringify(metadata), '::jsonb')
  }
  if (!sets.length) badRequest('No updatable fields provided')

  await supersedeLiveSocialRevisions(tx, post.id, post.client_id)
  params.push(post.id, post.client_id)
  const updated = await tx.query(
    `UPDATE social_posts
        SET ${sets.join(', ')},
            status = 'draft', approved_by = NULL, approved_at = NULL, approved_revision_id = NULL,
            approval_requested_at = NULL, approval_requested_by = NULL, rejection_reason = NULL,
            client_approval_revision_id = NULL,
            client_approval_status = CASE WHEN client_approval_status IS NULL THEN NULL ELSE 'pending' END,
            client_approval_responded_by = NULL, client_approval_responded_at = NULL, client_approval_feedback = NULL,
            updated_at = NOW()
      WHERE id = $${params.length - 1} AND client_id = $${params.length}
        AND status NOT IN (${[...LOCKED].map(status => `'${status}'`).join(', ')})
      RETURNING id`,
    params
  )
  if (!updated.rows[0]) throw createError({ statusCode: 409, statusMessage: 'Post changed state before this edit' })
  const current = (await tx.query('SELECT * FROM social_posts WHERE id=$1', [post.id])).rows[0]
  await bindTikTokDraftConsent(actor, current, patch, tx)
  await tx.query(
    `INSERT INTO social_publishing_audit_events (client_id, post_id, actor_id, action, metadata)
     VALUES ($1, $2, $3, 'post_updated', $4::jsonb)`,
    [post.client_id, post.id, actor.actorId, JSON.stringify({ source: 'mcp', fields: Object.keys(patch), approvalReset: true })]
  )
  return await getSocialPostStatus(actor, post.id, tx)
}

// ---------------------------------------------------------------------------------------------------
// Status

export interface SocialPostStatusView {
  postId: string
  clientId: string
  status: ReturnType<typeof socialWorkflowStatus>
  storedStatus: string
  reviewPolicy: string
  content: string
  targets: Array<{ platform: string, accountId: string, options?: Record<string, unknown> }>
  mediaAssets: Array<{ kind: string, id: string }>
  scheduledAt: string | null
  timezone: string
  createdBy: string | null
  revision: ReturnType<typeof socialRevisionView>
  clientApproval: { required: boolean, status: string | null, revisionId: string | null } | null
  attempts: number
  lastAttemptAt: string | null
  publishedAt: string | null
  results: Array<{ key: string, status: string, platform: string | null, accountId: string | null, platformPostId: string | null, url: string | null, error: string | null, providerStatus?: string | null, providerReceipt?: { code: string | null, logId: string | null }, nextPollAt?: string | null, publicPostIds?: string[] }>
  rejectionReason: string | null
}

const STATUS_SELECT = `SELECT p.id, p.client_id, p.status, p.review_policy, p.content, p.publish_targets, p.media_asset_refs,
         p.scheduled_at, p.timezone, p.created_by, p.metadata, p.client_approval_status, p.client_approval_revision_id,
         p.current_revision_id, p.publish_attempts, p.last_attempt_at, p.published_at, p.platform_results,
         p.rejection_reason,
         (SELECT row_to_json(r) FROM social_post_revisions r
           WHERE r.post_id = p.id AND r.client_id = p.client_id
           ORDER BY r.revision_number DESC LIMIT 1) AS latest_revision
    FROM social_posts p`

/** Status of one post the actor may see; results expose receipts/errors only (never credentials). */
export async function getSocialPostStatus(
  actor: SocialDraftActor,
  postId: string,
  tx?: SocialTxDb,
  db: SocialDraftDb = defaultDb
): Promise<SocialPostStatusView> {
  if (typeof postId !== 'string' || !UUID.test(postId)) notFound('Post')
  const params: unknown[] = [postId]
  let scopeSql: string
  if (actor.clientIds !== null) {
    if (!actor.clientIds.length) notFound('Post')
    params.push([...actor.clientIds])
    scopeSql = ' AND p.client_id = ANY($2::uuid[])'
  } else {
    scopeSql = ' AND EXISTS (SELECT 1 FROM agency_clients c WHERE c.id = p.client_id AND c.is_active = TRUE)'
  }
  const sql = `${STATUS_SELECT} WHERE p.id = $1${scopeSql}`
  const row = tx ? (await tx.query(sql, params)).rows[0] : await db.queryOne<any>(sql, params)
  if (!row) notFound('Post')
  const latest = row.latest_revision ? objectValue(row.latest_revision) as unknown as SocialRevisionRow : null
  const metadata = objectValue(row.metadata)
  const requiresClient = metadata.source === 'mcp_news'
  return {
    postId: row.id,
    clientId: row.client_id,
    status: socialWorkflowStatus(row, latest),
    storedStatus: row.status,
    reviewPolicy: row.review_policy ?? 'legacy',
    content: row.content ?? '',
    targets: arrayValue(row.publish_targets),
    mediaAssets: arrayValue(row.media_asset_refs),
    scheduledAt: toIsoOrNull(row.scheduled_at),
    timezone: row.timezone,
    createdBy: row.created_by ?? null,
    revision: socialRevisionView(latest),
    clientApproval: requiresClient
      ? { required: true, status: row.client_approval_status ?? null, revisionId: row.client_approval_revision_id ?? null }
      : null,
    attempts: Number(row.publish_attempts ?? 0),
    lastAttemptAt: toIsoOrNull(row.last_attempt_at),
    publishedAt: toIsoOrNull(row.published_at),
    results: Object.entries(objectValue(row.platform_results)).map(([key, raw]) => {
      const result = objectValue(raw)
      const text = (value: unknown) => (typeof value === 'string' && value ? value.slice(0, 500) : null)
      return {
        key,
        status: text(result.status) ?? 'unknown',
        platform: text(result.platform),
        accountId: text(result.accountId),
        platformPostId: text(result.platformPostId),
        url: text(result.url),
        error: text(result.error),
        providerStatus: text(result.providerStatus),
        providerReceipt: { code: text(objectValue(result.providerReceipt).code), logId: text(objectValue(result.providerReceipt).logId) },
        nextPollAt: toIsoOrNull(result.nextPollAt),
        publicPostIds: arrayValue<string>(result.publicPostIds).filter(id => typeof id === 'string' && /^\d{1,64}$/.test(id)).slice(0, 35)
      }
    }),
    rejectionReason: row.rejection_reason ?? null
  }
}
