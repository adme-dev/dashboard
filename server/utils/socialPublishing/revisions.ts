import { STAFF_REVIEWED_PUBLISH_PLATFORMS } from '~~/shared/socialCapabilityReadiness'
import { validateTikTokReviewedTargets } from '~~/server/utils/socialPublishing/tiktokReview'
// server/utils/socialPublishing/revisions.ts
// Immutable, revision-bound review for social posts (migration 483).
//
//  * Submission freezes the complete publish payload — content, ordered exact targets and provider
//    options, overrides, link/hashtags/first comment, schedule/timezone, campaign/package attribution
//    and (delegated posts) the content identity of every reviewed media object — as canonical JSON with
//    a SHA-256 hash. Revision 1 is created on first submission, not on autosave.
//  * Delegated (`review_policy = 'delegated_marketing'`) posts need a separate, freshly authorized
//    owner/admin reviewer who is neither the requester nor the draft creator; approval binds the exact
//    revision id + hash, expires, and is single-use at dispatch.
//  * Legacy posts keep their browser approval behaviour; their submissions are also recorded as
//    revisions so the existing client-portal gate can bind to the same revision.
import { createHash } from 'node:crypto'
import { createError, type H3Event } from 'h3'
import { normalizePublishingTargets } from '~~/server/utils/socialPublishing/guards'
import { productionReadyPublishPlatformsError } from '~~/server/utils/socialPublishing/platformReadiness'
import { effectiveSocialPayloadError, resolveEffectiveSocialTargets } from '~~/server/utils/socialPublishing/effectivePayload'
import {
  assertProviderCompatibleMedia,
  assertSocialMediaAssetsCurrent,
  normalizeSocialMediaAssetRefs,
  resolveSocialMediaAssets,
  type SocialMediaAssetIdentity
} from '~~/server/utils/socialPublishing/mediaAssets'

export type SocialReviewPolicy = 'legacy' | 'delegated_marketing'
export type SocialRevisionStatus = 'pending' | 'approved' | 'rejected' | 'superseded' | 'expired' | 'dispatch_claimed'

/** Organic platforms the delegated staff workflow supports. */
export const DELEGATED_SOCIAL_PLATFORMS = Object.freeze(STAFF_REVIEWED_PUBLISH_PLATFORMS)
const DELEGATED_PLATFORM_SET = new Set<string>(DELEGATED_SOCIAL_PLATFORMS)

/** Statuses whose content is frozen: already dispatched, ambiguous or terminal. */
export const SOCIAL_POST_CONTENT_LOCKED_STATUSES = Object.freeze([
  'publishing', 'accepted', 'published', 'partially_published', 'unknown', 'cancelled'
] as const)
const CONTENT_LOCKED = new Set<string>(SOCIAL_POST_CONTENT_LOCKED_STATUSES)

const IMMEDIATE_APPROVAL_TTL_MS = 24 * 60 * 60 * 1000
const SCHEDULED_APPROVAL_GRACE_MS = 60 * 60 * 1000

export interface SocialTxDb {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: any[], rowCount?: number | null }>
}

export interface SocialPostReviewRow {
  id: string
  client_id: string
  created_by: string | null
  content: string | null
  media_urls: string[] | null
  link_url: string | null
  hashtags: string[] | null
  first_comment: string | null
  platforms: string[] | null
  account_ids: string[] | null
  publish_targets: unknown
  platform_overrides: unknown
  scheduled_at: string | Date | null
  timezone: string | null
  status: string
  metadata: unknown
  campaign_id: string | null
  review_policy: SocialReviewPolicy | null
  media_asset_refs: unknown
  current_revision_id: string | null
  approved_revision_id: string | null
  client_approval_revision_id: string | null
  client_approval_status: string | null
  approved_by: string | null
  approval_requested_by: string | null
}

export interface SocialPostSnapshot {
  v: 1
  postId: string
  clientId: string
  reviewPolicy: SocialReviewPolicy
  content: string
  linkUrl: string | null
  hashtags: string[]
  firstComment: string | null
  platforms: string[]
  accountIds: string[]
  targets: Array<{ platform: string, accountId: string, options?: Record<string, unknown> }>
  platformOverrides: Record<string, unknown>
  /** Legacy browser media URLs (delegated posts always use `media`). */
  mediaUrls: string[]
  media: SocialMediaAssetIdentity[]
  schedule: { scheduledAt: string | null, timezone: string }
  attribution: {
    campaignId: string | null
    packageAssignmentId: string | null
    source: string | null
    newsItemId: string | null
  }
}

export interface SocialRevisionRow {
  id: string
  post_id: string
  client_id: string
  revision_number: number
  review_policy: SocialReviewPolicy
  content_hash: string
  snapshot: SocialPostSnapshot
  requested_by: string
  requested_at: string
  review_status: SocialRevisionStatus
  reviewed_by: string | null
  reviewed_at: string | null
  review_reason: string | null
  expires_at: string
  dispatch_claimed_at: string | null
  dispatch_attempt: number
  dispatch_outcome: string | null
}

export const SOCIAL_POST_REVIEW_COLUMNS = `id, client_id, created_by, content, media_urls, link_url, hashtags, first_comment,
  platforms, account_ids, publish_targets, platform_overrides, scheduled_at, timezone, status, metadata,
  campaign_id, review_policy, media_asset_refs, current_revision_id, approved_revision_id,
  client_approval_revision_id, client_approval_status, approved_by, approval_requested_by`

function conflict(message: string): never {
  throw createError({ statusCode: 409, statusMessage: message })
}

function badRequest(message: string): never {
  throw createError({ statusCode: 400, statusMessage: message })
}

export function objectValue(value: unknown): Record<string, unknown> {
  if (!value) return {}
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
    } catch {
      return {}
    }
  }
  return typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

export function arrayValue<T = unknown>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[]
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      return Array.isArray(parsed) ? parsed as T[] : []
    } catch {
      return []
    }
  }
  return []
}

export function toIsoOrNull(value: unknown): string | null {
  if (value == null || value === '') return null
  const time = value instanceof Date ? value.getTime() : Date.parse(String(value))
  return Number.isFinite(time) ? new Date(time).toISOString() : null
}

function sortedJson(value: unknown): unknown {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Snapshot contains a non-finite number')
    return value
  }
  if (value === undefined) return null
  if (Array.isArray(value)) return value.map(sortedJson)
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const item = (value as Record<string, unknown>)[key]
      if (item !== undefined) out[key] = sortedJson(item)
    }
    return out
  }
  throw new Error('Snapshot is not JSON-serializable')
}

/** Deterministic JSON (sorted keys; undefined dropped). */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortedJson(value))
}

export function socialSnapshotHash(snapshot: SocialPostSnapshot): string {
  return createHash('sha256').update(canonicalJson(snapshot)).digest('hex')
}

export function reviewPolicyOf(post: Pick<SocialPostReviewRow, 'review_policy'>): SocialReviewPolicy {
  return post.review_policy === 'delegated_marketing' ? 'delegated_marketing' : 'legacy'
}

/** Build the canonical snapshot of a post's current publishable state. */
export function buildSocialPostSnapshot(
  post: SocialPostReviewRow,
  media: readonly SocialMediaAssetIdentity[]
): SocialPostSnapshot {
  const metadata = objectValue(post.metadata)
  const policy = reviewPolicyOf(post)
  const targets = arrayValue<Record<string, unknown>>(post.publish_targets)
    .filter(target => typeof target?.platform === 'string' && typeof target?.accountId === 'string')
    .map(target => {
      const options = objectValue(target.options)
      return Object.keys(options).length
        ? { platform: String(target.platform), accountId: String(target.accountId), options }
        : { platform: String(target.platform), accountId: String(target.accountId) }
    })
  return {
    v: 1,
    postId: post.id,
    clientId: post.client_id,
    reviewPolicy: policy,
    content: post.content ?? '',
    linkUrl: post.link_url ?? null,
    hashtags: arrayValue<string>(post.hashtags),
    firstComment: post.first_comment ?? null,
    platforms: arrayValue<string>(post.platforms),
    accountIds: arrayValue<string>(post.account_ids),
    targets,
    platformOverrides: objectValue(post.platform_overrides),
    mediaUrls: policy === 'delegated_marketing' ? [] : arrayValue<string>(post.media_urls),
    media: media.map(item => ({ ...item })),
    schedule: { scheduledAt: toIsoOrNull(post.scheduled_at), timezone: post.timezone || 'Australia/Sydney' },
    attribution: {
      campaignId: post.campaign_id ?? null,
      packageAssignmentId: typeof metadata.socialPackageAssignmentId === 'string' ? metadata.socialPackageAssignmentId : null,
      source: typeof metadata.source === 'string' ? metadata.source : null,
      newsItemId: typeof metadata.newsItemId === 'string' ? metadata.newsItemId : null
    }
  }
}

export function revisionExpiry(scheduledAt: string | null, now = Date.now()): Date {
  const scheduled = scheduledAt ? Date.parse(scheduledAt) : Number.NaN
  return Number.isFinite(scheduled) && scheduled > now
    ? new Date(scheduled + SCHEDULED_APPROVAL_GRACE_MS)
    : new Date(now + IMMEDIATE_APPROVAL_TTL_MS)
}

async function lockPost(db: SocialTxDb, postId: string): Promise<SocialPostReviewRow | null> {
  const result = await db.query(
    `SELECT ${SOCIAL_POST_REVIEW_COLUMNS} FROM social_posts WHERE id = $1 FOR UPDATE`,
    [postId]
  )
  return result.rows[0] ?? null
}

/** Supersede every live (pending/approved) revision of a post. Used by every approval-sensitive edit. */
export async function supersedeLiveSocialRevisions(db: SocialTxDb, postId: string, clientId: string): Promise<number> {
  const result = await db.query(
    `UPDATE social_post_revisions SET review_status = 'superseded'
      WHERE post_id = $1 AND client_id = $2 AND review_status IN ('pending', 'approved')`,
    [postId, clientId]
  )
  return result.rowCount ?? 0
}

/**
 * Fresh delegated validation: exact targets (read on the locked, uncached transaction connection), staff
 * platforms, readiness, media identity + compatibility, and the EFFECTIVE per-target payload — the same
 * option precedence and copy/hashtag/link composition dispatch delivers — so nothing approved can later be
 * truncated, dropped or published in a different mode.
 */
async function validateDelegatedSubmission(
  db: SocialTxDb,
  event: H3Event,
  post: SocialPostReviewRow,
  options: { resolveMedia?: typeof resolveSocialMediaAssets } = {}
): Promise<SocialMediaAssetIdentity[]> {
  const rawTargets = arrayValue(post.publish_targets)
  if (!rawTargets.length) badRequest('Choose at least one exact publishing account before submitting')
  const targets = await normalizePublishingTargets(post.client_id, rawTargets, {
    queryRows: async <T>(sql: string, params?: unknown[]) => (await db.query(sql, params)).rows as T[]
  })
  if (!targets?.targets.length) badRequest('Choose at least one exact publishing account before submitting')
  for (const target of targets.targets) {
    if (!DELEGATED_PLATFORM_SET.has(target.platform)) badRequest(`${target.platform} is not available for delegated drafts`)
  }
  const readiness = productionReadyPublishPlatformsError(targets.platforms)
  if (readiness) badRequest(readiness)
  const overrides = objectValue(post.platform_overrides)
  for (const override of Object.values(overrides)) {
    if (arrayValue(objectValue(override).mediaUrls).length) badRequest('Delegated drafts use media assets, not media URLs')
  }
  if (arrayValue(post.media_urls).length) badRequest('Delegated drafts use media assets, not media URLs')

  const refs = normalizeSocialMediaAssetRefs(arrayValue(post.media_asset_refs))
  const media = await (options.resolveMedia ?? resolveSocialMediaAssets)({ event, clientId: post.client_id, refs })
  const effective = resolveEffectiveSocialTargets({
    postId: post.id,
    content: post.content,
    linkUrl: post.link_url,
    hashtags: arrayValue<string>(post.hashtags),
    firstComment: post.first_comment,
    targets: targets.targets,
    platformOverrides: overrides
  }, media)
  // Instagram mode comes from the effective options (a platform override's story/reel counts too).
  const instagramTypes = Object.fromEntries(effective
    .filter(target => target.platform === 'instagram')
    .map(target => [target.accountId, typeof target.options.type === 'string' ? target.options.type : undefined]))
  const content = post.content ?? ''
  if (!content.trim() && !media.length) badRequest('Add post text or media before submitting')
  assertProviderCompatibleMedia(targets.platforms, media, { content, instagramTypes })
  const payloadError = effectiveSocialPayloadError(effective, media)
  if (payloadError) badRequest(payloadError)
  await validateTikTokReviewedTargets(event, post.client_id, effective, media)
  return media
}

export interface SubmitSocialRevisionInput {
  event: H3Event
  postId: string
  requesterId: string
  /** Fresh client coverage of the requester (null = all active clients). */
  clientIds: readonly string[] | null
  /** Restrict to delegated posts (MCP) — never lets staff submit a legacy self-approvable row. */
  delegatedOnly?: boolean
  /** Restrict to drafts created by this actor (MCP staff submit only their own drafts). */
  creatorId?: string
  now?: number
  resolveMedia?: typeof resolveSocialMediaAssets
}

export interface SubmittedSocialRevision {
  revision: SocialRevisionRow
  post: { id: string, client_id: string, status: string, metadata: Record<string, unknown> }
}

/** Freeze the post's current state as the next immutable revision and request review. */
export async function submitSocialPostForReview(
  db: SocialTxDb,
  input: SubmitSocialRevisionInput
): Promise<SubmittedSocialRevision> {
  const post = await lockPost(db, input.postId)
  if (!post || (input.clientIds !== null && !input.clientIds.includes(post.client_id))) {
    throw createError({ statusCode: 404, statusMessage: 'Post not found' })
  }
  const policy = reviewPolicyOf(post)
  if (input.delegatedOnly && policy !== 'delegated_marketing') {
    throw createError({ statusCode: 403, statusMessage: 'Only delegated marketing drafts can be submitted here' })
  }
  if (input.creatorId && post.created_by !== input.creatorId) {
    throw createError({ statusCode: 404, statusMessage: 'Post not found' })
  }
  if (CONTENT_LOCKED.has(post.status)) conflict(`Cannot submit a ${post.status} post`)
  if (policy === 'delegated_marketing' && !['draft', 'failed'].includes(post.status)) {
    conflict('Only drafts can be submitted for review')
  }

  let media: SocialMediaAssetIdentity[] = []
  const now = input.now ?? Date.now()
  if (policy === 'delegated_marketing') {
    media = await validateDelegatedSubmission(db, input.event, post, { resolveMedia: input.resolveMedia })
    const scheduled = toIsoOrNull(post.scheduled_at)
    if (scheduled && Date.parse(scheduled) <= now) badRequest('scheduledAt must be in the future')
  }

  const snapshot = buildSocialPostSnapshot(post, media)
  const contentHash = socialSnapshotHash(snapshot)
  await supersedeLiveSocialRevisions(db, post.id, post.client_id)
  const next = await db.query(
    'SELECT COALESCE(MAX(revision_number), 0) + 1 AS next FROM social_post_revisions WHERE post_id = $1',
    [post.id]
  )
  const revisionNumber = Number(next.rows[0]?.next ?? 1)
  const inserted = await db.query(
    `INSERT INTO social_post_revisions
       (post_id, client_id, revision_number, review_policy, content_hash, snapshot, requested_by, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)
     RETURNING *`,
    [post.id, post.client_id, revisionNumber, policy, contentHash, canonicalJson(snapshot), input.requesterId,
      revisionExpiry(snapshot.schedule.scheduledAt, now).toISOString()]
  )
  const revision = inserted.rows[0] as SocialRevisionRow | undefined
  if (!revision) throw new Error('Social revision was not recorded')

  const updated = await db.query(
    `UPDATE social_posts
        SET current_revision_id = $3::uuid,
            approved_revision_id = NULL,
            status = CASE WHEN status = 'failed' THEN 'draft' ELSE status END,
            approval_requested_at = NOW(), approval_requested_by = $4::text,
            approved_by = CASE WHEN review_policy = 'delegated_marketing' THEN NULL ELSE approved_by END,
            approved_at = CASE WHEN review_policy = 'delegated_marketing' THEN NULL ELSE approved_at END,
            client_approval_revision_id = CASE WHEN metadata->>'source' = 'mcp_news' THEN $3::uuid ELSE NULL END,
            client_approval_status = CASE
              WHEN metadata->>'source' = 'mcp_news' THEN 'pending'
              ELSE client_approval_status
            END,
            client_approval_responded_by = CASE WHEN metadata->>'source' = 'mcp_news' THEN NULL ELSE client_approval_responded_by END,
            client_approval_responded_at = NULL,
            client_approval_feedback = CASE WHEN metadata->>'source' = 'mcp_news' THEN NULL ELSE client_approval_feedback END,
            due_at = (
              SELECT CASE WHEN (v.commercial_scope->>'approvalSlaHours') ~ '^[0-9]+$'
                THEN NOW() + ((v.commercial_scope->>'approvalSlaHours')::int * INTERVAL '1 hour')
                ELSE NULL END
                FROM social_content_package_assignments a
                JOIN social_content_package_versions v ON v.id = a.package_version_id
               WHERE a.id::text = social_posts.metadata->>'socialPackageAssignmentId'
            ),
            updated_at = NOW()
      WHERE id = $1 AND client_id = $2
      RETURNING id, client_id, status, metadata`,
    [post.id, post.client_id, revision.id, input.requesterId]
  )
  const updatedPost = updated.rows[0]
  if (!updatedPost) conflict('Post changed before submission')
  await recordRevisionAudit(db, {
    clientId: post.client_id,
    postId: post.id,
    actorId: input.requesterId,
    action: 'revision_submitted',
    metadata: { revisionId: revision.id, revisionNumber, contentHash, reviewPolicy: policy, mediaCount: media.length }
  })
  return { revision, post: { ...updatedPost, metadata: objectValue(updatedPost.metadata) } }
}

export interface ReviewSocialRevisionInput {
  event: H3Event
  postId: string
  /** Required for delegated posts; legacy browser callers may omit it to target the current revision. */
  revisionId?: string | null
  decision: 'approved' | 'rejected'
  reason?: string | null
  reviewerId: string
  now?: number
  assertMediaCurrent?: typeof assertSocialMediaAssetsCurrent
}

export interface ReviewedSocialRevision {
  post: { id: string, client_id: string, status: string, scheduled_at: string | null, content: string | null, approval_requested_by: string | null, metadata: Record<string, unknown> }
  revision: SocialRevisionRow | null
  policy: SocialReviewPolicy
}

async function lockRevision(db: SocialTxDb, revisionId: string, postId: string): Promise<SocialRevisionRow | null> {
  const result = await db.query(
    'SELECT * FROM social_post_revisions WHERE id = $1 AND post_id = $2 FOR UPDATE',
    [revisionId, postId]
  )
  return result.rows[0] ?? null
}

/**
 * Decide the exact current revision. Delegated callers must already have passed
 * requireIndependentMarketingReviewer for `reviewerId`; this function enforces exactness (id, hash vs the
 * post's current state, currentness, expiry, single decision), re-verifies reviewed media bytes, the
 * creator/requester separation and the client-portal gate, then performs the existing status update.
 */
export async function reviewSocialPostRevision(
  db: SocialTxDb,
  input: ReviewSocialRevisionInput
): Promise<ReviewedSocialRevision> {
  const post = await lockPost(db, input.postId)
  if (!post) throw createError({ statusCode: 404, statusMessage: 'Post not found' })
  const policy = reviewPolicyOf(post)
  const now = input.now ?? Date.now()
  const metadata = objectValue(post.metadata)
  const isNews = metadata.source === 'mcp_news'

  if (policy === 'delegated_marketing' && !input.revisionId) badRequest('revisionId required')
  if (input.revisionId && input.revisionId !== post.current_revision_id) {
    conflict('This revision is no longer current. Reload the latest submission.')
  }
  const revisionId = input.revisionId ?? post.current_revision_id
  let revision = revisionId ? await lockRevision(db, revisionId, post.id) : null
  if (policy === 'delegated_marketing' || input.revisionId) {
    if (!revision || revision.client_id !== post.client_id) conflict('This revision is no longer current.')
  }
  if (revision && revision.review_status !== 'pending') {
    if (policy === 'delegated_marketing' || input.revisionId) conflict('This revision was already decided.')
    revision = null
  }

  if (policy === 'delegated_marketing' && revision) {
    if (post.status !== 'draft') conflict('Only drafts awaiting review can be decided')
    const reviewer = input.reviewerId.toLowerCase()
    if (reviewer === revision.requested_by.toLowerCase() || reviewer === (post.created_by ?? '').toLowerCase()) {
      throw createError({ statusCode: 403, statusMessage: 'Requesters cannot review their own delegated submission' })
    }
    if (input.decision === 'approved') {
      if (Date.parse(String(revision.expires_at)) <= now) conflict('This review request expired. Resubmit the draft.')
      const scheduled = revision.snapshot?.schedule?.scheduledAt
      if (scheduled && Date.parse(scheduled) <= now) conflict('The scheduled time has passed. Resubmit with a new schedule.')
      const current = buildSocialPostSnapshot(post, revision.snapshot?.media ?? [])
      if (socialSnapshotHash(current) !== revision.content_hash) {
        conflict('The post changed after submission. Resubmit it for review.')
      }
      await validateTikTokReviewedTargets(input.event, post.client_id,
        resolveEffectiveSocialTargets(revision.snapshot, revision.snapshot.media ?? []), revision.snapshot.media ?? [])
      await (input.assertMediaCurrent ?? assertSocialMediaAssetsCurrent)({
        event: input.event,
        clientId: post.client_id,
        identities: revision.snapshot?.media ?? []
      })
    }
  } else if (policy === 'delegated_marketing') {
    conflict('This revision is no longer current.')
  } else if (post.status !== 'draft' && input.decision === 'approved') {
    conflict('Only draft posts can be approved')
  }

  if (input.decision === 'approved' && isNews) {
    if (post.client_approval_status !== 'approved') conflict('Client approval is required before internal approval')
    if (post.current_revision_id && post.client_approval_revision_id !== post.current_revision_id) {
      conflict('Client approval covers a different revision. Request client approval again.')
    }
  }

  const reason = typeof input.reason === 'string' && input.reason.trim() ? input.reason.trim().slice(0, 4000) : null
  if (revision) {
    const decided = await db.query(
      `UPDATE social_post_revisions
          SET review_status = $3, reviewed_by = $4, reviewed_at = NOW(), review_reason = $5
        WHERE id = $1 AND post_id = $2 AND review_status = 'pending'
        RETURNING *`,
      [revision.id, post.id, input.decision, input.reviewerId, reason]
    )
    revision = decided.rows[0] ?? null
    if (!revision) conflict('This revision was already decided.')
  }

  const updated = input.decision === 'approved'
    ? await db.query(
        `UPDATE social_posts
            SET status = CASE WHEN scheduled_at IS NOT NULL AND scheduled_at > NOW() THEN 'scheduled' ELSE 'approved' END,
                approved_by = $2, approved_at = NOW(), approved_revision_id = $4,
                rejection_reason = NULL, updated_at = NOW()
          WHERE id = $1 AND client_id = $3 AND status = 'draft'
          RETURNING id, client_id, status, scheduled_at, content, approval_requested_by, metadata`,
        [post.id, input.reviewerId, post.client_id, revision?.id ?? null]
      )
    : await db.query(
        // Legacy rejection keeps its existing unconditional return-to-draft; delegated rejection only
        // reopens a draft that is not already dispatched or held.
        `UPDATE social_posts
            SET status = 'draft',
                rejection_reason = $2, approved_by = NULL, approved_at = NULL, approved_revision_id = NULL,
                approval_requested_at = NULL, approval_requested_by = NULL, updated_at = NOW()
          WHERE id = $1 AND client_id = $3
            AND (review_policy <> 'delegated_marketing' OR status = 'draft')
          RETURNING id, client_id, status, scheduled_at, content, metadata`,
        [post.id, reason, post.client_id]
      )
  const updatedPost = updated.rows[0]
  if (!updatedPost) conflict('Post changed state before this decision')
  await recordRevisionAudit(db, {
    clientId: post.client_id,
    postId: post.id,
    actorId: input.reviewerId,
    action: input.decision === 'approved' ? 'revision_approved' : 'revision_rejected',
    metadata: {
      revisionId: revision?.id ?? null,
      contentHash: revision?.content_hash ?? null,
      reviewPolicy: policy,
      hasReason: Boolean(reason)
    }
  })
  return {
    post: {
      ...updatedPost,
      scheduled_at: toIsoOrNull(updatedPost.scheduled_at),
      approval_requested_by: updatedPost.approval_requested_by ?? post.approval_requested_by ?? null,
      metadata: objectValue(updatedPost.metadata)
    },
    revision,
    policy
  }
}

async function recordRevisionAudit(db: SocialTxDb, input: {
  clientId: string
  postId: string
  actorId: string | null
  action: string
  metadata: Record<string, unknown>
}): Promise<void> {
  // Fail closed: the revision state change and its audit commit together.
  await db.query(
    `INSERT INTO social_publishing_audit_events (client_id, post_id, actor_id, action, metadata)
     VALUES ($1, $2, $3, $4, $5::jsonb)`,
    [input.clientId, input.postId, input.actorId, input.action, JSON.stringify(input.metadata)]
  )
}

// ---------------------------------------------------------------------------------------------------
// Read projections

export type SocialPostWorkflowStatus =
  | 'draft' | 'awaiting_client' | 'awaiting_review' | 'rejected' | 'approved' | 'scheduled'
  | 'publishing' | 'accepted' | 'published' | 'partially_published' | 'failed' | 'unknown' | 'cancelled'

export function socialWorkflowStatus(
  post: { status: string, client_approval_status?: string | null, metadata?: unknown, rejection_reason?: string | null },
  latest: Pick<SocialRevisionRow, 'review_status'> | null
): SocialPostWorkflowStatus {
  if (post.status !== 'draft') return post.status as SocialPostWorkflowStatus
  if (latest?.review_status === 'pending') {
    return objectValue(post.metadata).source === 'mcp_news' && post.client_approval_status !== 'approved'
      ? 'awaiting_client'
      : 'awaiting_review'
  }
  if (latest?.review_status === 'rejected' || post.rejection_reason) return 'rejected'
  return 'draft'
}

/** Public revision projection (no snapshot internals beyond reviewable fields). */
export function socialRevisionView(revision: SocialRevisionRow | null) {
  if (!revision) return null
  const snapshot = revision.snapshot ?? ({} as SocialPostSnapshot)
  return {
    id: revision.id,
    number: Number(revision.revision_number),
    contentHash: revision.content_hash,
    reviewPolicy: revision.review_policy,
    status: revision.review_status,
    requestedBy: revision.requested_by,
    requestedAt: toIsoOrNull(revision.requested_at),
    reviewedBy: revision.reviewed_by,
    reviewedAt: toIsoOrNull(revision.reviewed_at),
    reviewReason: revision.review_reason,
    expiresAt: toIsoOrNull(revision.expires_at),
    dispatch: {
      claimedAt: toIsoOrNull(revision.dispatch_claimed_at),
      attempt: Number(revision.dispatch_attempt ?? 0),
      outcome: revision.dispatch_outcome
    },
    targets: arrayValue(snapshot.targets),
    media: arrayValue<SocialMediaAssetIdentity>(snapshot.media).map(item => ({
      kind: item.kind, id: item.id, mediaType: item.mediaType, mimeType: item.mimeType, byteSize: item.byteSize
    })),
    schedule: snapshot.schedule ?? null
  }
}
