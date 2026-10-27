import type { H3Event } from 'h3'
import { verifyNewsroomSource } from '~~/server/utils/newsroomSocialSource'
import { verifyAutomaticNewsSource } from '~~/server/utils/socialNewsAutopostSource'
import { execute, queryOne, queryRows, queryRowsFresh, transaction } from '~~/server/utils/db'
import { publishPost, type PublishableAccount, type PublishablePost, type PublishOutcome } from '~~/server/utils/socialPublishing'
import { recordSocialPublishingAudit, type SocialPublishingAuditAction } from '~~/server/utils/socialPublishing/audit'
import type { SocialMediaAssetIdentity } from '~~/server/utils/socialPublishing/mediaAssets'
import type { SocialPostReviewRow, SocialPostSnapshot, SocialRevisionRow } from '~~/server/utils/socialPublishing/revisions'

// Delegated-review dependencies load lazily so the legacy dispatch path keeps its existing module graph.
const delegatedDeps = () => Promise.all([
  import('~~/server/utils/ai/marketing/reviewAuthority'),
  import('~~/server/utils/socialPublishing/mediaAssets'),
  import('~~/server/utils/socialPublishing/revisions'),
  import('~~/server/utils/socialPublishing/effectivePayload')
])

export type SocialPublishingDispatchSource = 'manual' | 'cron' | 'workflow'

/**
 * Delegated posts are claimed only when their CURRENT revision is the approved, unexpired, unclaimed
 * revision reviewed by someone other than its requester/creator, with an unchanged schedule and (news
 * drafts) a client decision on the same revision. Legacy rows are unaffected. `$6` binds the expected
 * revision; delegated rows REQUIRE it, so a stale callback (or a pre-revision Worker that drops the
 * field) can never claim newer content — it fails closed and the post stays held for a current run.
 */
const DELEGATED_REVIEW_GATE_SQL = `
        AND ($6::uuid IS NULL OR approved_revision_id = $6::uuid)
        AND (review_policy IS DISTINCT FROM 'delegated_marketing' OR ($6::uuid IS NOT NULL AND EXISTS (
          SELECT 1 FROM social_post_revisions r
           WHERE r.id = social_posts.approved_revision_id
             AND r.id = social_posts.current_revision_id
             AND r.post_id = social_posts.id AND r.client_id = social_posts.client_id
             AND r.review_policy = 'delegated_marketing'
             AND r.review_status = 'approved' AND r.dispatch_claimed_at IS NULL
             AND r.expires_at > NOW()
             AND r.reviewed_by IS NOT NULL AND r.reviewed_by = social_posts.approved_by
             AND r.reviewed_by <> r.requested_by
             AND r.reviewed_by IS DISTINCT FROM social_posts.created_by
             AND (r.snapshot #>> '{schedule,scheduledAt}')::timestamptz IS NOT DISTINCT FROM social_posts.scheduled_at
             AND (social_posts.metadata->>'source' IS DISTINCT FROM 'mcp_news'
                  OR (social_posts.client_approval_status = 'approved' AND social_posts.client_approval_revision_id = r.id))
        )))`

export interface ClaimAndPublishSocialPostInput {
  postId: string
  clientId?: string | null
  scheduledAt?: string | null
  claimStatuses: readonly string[]
  maxAttempts?: number | null
  source: SocialPublishingDispatchSource
  actorId?: string | null
  auditAction?: SocialPublishingAuditAction
  log?: Pick<Console, 'log' | 'warn' | 'error'>
  /** Request event: required to re-verify delegated authority, media storage and delivery signing. */
  event?: H3Event | null
  /** Expected approved revision (workflow payload / approve-start); null for legacy callers. */
  revisionId?: string | null
}

export interface ClaimAndPublishSocialPostResult {
  ok: true
  postId: string
  clientId?: string | null
  status?: PublishOutcome['status']
  platformResults?: PublishOutcome['platformResults']
  skipped?: boolean
  reason?: 'not_claimed' | 'source_unavailable' | 'story_withdrawn' | 'newsroom_approval_invalid'
    | 'review_gate' | 'authority_unavailable'
  revisionId?: string | null
  currentStatus?: string | null
  accountsCount?: number
  targets?: string[]
}

interface SocialPostDispatchRow extends PublishablePost {
  created_by?: string | null
  scheduled_at?: string | null
  metadata?: Record<string, unknown>
  client_id: string
  status: string
  account_ids: string[] | null
  review_policy?: string | null
  approved_revision_id?: string | null
  approved_by?: string | null
}

interface CurrentPostState {
  id: string
  client_id: string
  status: string | null
}

const FAILED_DISPATCH_RESULT_KEY = 'dispatch'

export async function claimAndPublishSocialPost(
  input: ClaimAndPublishSocialPostInput
): Promise<ClaimAndPublishSocialPostResult> {
  const log = input.log ?? console
  const claimStatuses = normalizeClaimStatuses(input.claimStatuses)
  const claimed = await queryOne<SocialPostDispatchRow>(
    `UPDATE social_posts
        SET status='publishing', last_attempt_at=NOW(), updated_at=NOW()
      WHERE id=$1
        AND ($2::uuid IS NULL OR client_id=$2)
        AND status = ANY($3::text[])
        AND (metadata->>'newsAutopostAutomatic' IS DISTINCT FROM 'true' OR EXISTS (
          SELECT 1 FROM social_news_autopost_rules r
          WHERE r.id::text = social_posts.metadata->>'newsAutopostRuleId'
            AND r.client_id = social_posts.client_id AND r.mode = 'automatic'
            AND r.account_id = ANY(social_posts.account_ids)
        ))
        AND ($4::int IS NULL OR publish_attempts < $4)
        AND ($5::timestamptz IS NULL OR (scheduled_at = $5::timestamptz AND scheduled_at <= NOW()))${DELEGATED_REVIEW_GATE_SQL}
      RETURNING *`,
    [input.postId, input.clientId ?? null, claimStatuses, input.maxAttempts ?? null, input.scheduledAt ?? null, input.revisionId ?? null]
  )

  if (!claimed) {
    const current = await queryOne<CurrentPostState>(
      'SELECT id, client_id, status FROM social_posts WHERE id=$1',
      [input.postId]
    )
    const skipped: ClaimAndPublishSocialPostResult = {
      ok: true,
      skipped: true,
      reason: 'not_claimed',
      postId: input.postId,
      clientId: current?.client_id ?? input.clientId ?? null,
      currentStatus: current?.status ?? null
    }
    log.warn('social-publishing.dispatch.skipped', {
      source: input.source,
      postId: skipped.postId,
      clientId: skipped.clientId,
      currentStatus: skipped.currentStatus,
      claimStatuses
    })
    return skipped
  }

  if (claimed.review_policy === 'delegated_marketing') {
    return await publishDelegatedClaim(claimed, input, claimStatuses, log)
  }

  if (await verifyNewsroomSource(claimed) !== 'ready') {
    await execute(`UPDATE social_posts SET status='failed', updated_at=NOW(),
      metadata=jsonb_set(metadata,'{newsroomHold}',to_jsonb('Newsroom article or approved copy changed; delivery held'::text))
      WHERE id=$1 AND client_id=$2 AND status='publishing'`, [claimed.id, claimed.client_id])
    return { ok: true, skipped: true, postId: claimed.id, clientId: claimed.client_id, reason: 'newsroom_approval_invalid' }
  }
  const sourceStatus = await verifyAutomaticNewsSource(claimed)
  if (sourceStatus !== 'ready') {
    await transaction(async (db) => {
      await db.query('SELECT pg_advisory_xact_lock(hashtextextended(\'news-autopost:\' || $1::text, 0))', [claimed.client_id])
      const rule = (await db.query(`SELECT mode,account_id FROM social_news_autopost_rules
        WHERE id::text=$1 AND client_id=$2 FOR UPDATE`, [claimed.metadata?.newsAutopostRuleId, claimed.client_id])).rows[0]
      const retryAllowed = sourceStatus === 'retry' && rule?.mode === 'automatic' && claimed.account_ids?.includes(rule.account_id)
      await db.query(`UPDATE social_posts SET status=$2,updated_at=NOW() WHERE id=$1 AND status='publishing'`, [claimed.id, retryAllowed ? 'scheduled' : 'cancelled'])
    })
    log.warn('social-news-autopost.source-check', { postId: claimed.id, status: sourceStatus })
    return { ok: true, skipped: true, postId: claimed.id, clientId: claimed.client_id, reason: sourceStatus === 'withdrawn' ? 'story_withdrawn' : 'source_unavailable' }
  }
  const published = await publishClaimedPost(claimed, input, log)
  const outcome = published.outcome
  await execute(
    `UPDATE social_posts SET status=$2, platform_results=$3::jsonb,
       publish_attempts=publish_attempts+1,
       published_at=CASE WHEN $2 IN ('published','partially_published') THEN COALESCE(published_at, NOW()) ELSE published_at END,
       updated_at=NOW()
     WHERE id=$1 AND client_id=$4`,
    [claimed.id, outcome.status, JSON.stringify(outcome.platformResults), claimed.client_id]
  )

  const targets = Object.keys(outcome.platformResults)
  if (input.auditAction) {
    await recordSocialPublishingAudit({
      clientId: claimed.client_id,
      postId: claimed.id,
      actorId: input.actorId ?? null,
      action: input.auditAction,
      metadata: {
        source: input.source,
        status: outcome.status,
        targets
      }
    })
  }

  log.log('social-publishing.dispatch.completed', {
    source: input.source,
    postId: claimed.id,
    clientId: claimed.client_id,
    status: outcome.status,
    targets
  })

  return {
    ok: true,
    postId: claimed.id,
    clientId: claimed.client_id,
    status: outcome.status,
    platformResults: outcome.platformResults,
    accountsCount: published.accountsCount,
    targets
  }
}

async function publishClaimedPost(
  post: SocialPostDispatchRow,
  input: ClaimAndPublishSocialPostInput,
  log: Pick<Console, 'error'>
): Promise<{ outcome: PublishOutcome, accountsCount: number }> {
  try {
    const accounts = await queryRows<PublishableAccount>(
      `SELECT sa.id, sa.platform, sa.platform_account_id, sa.access_token, sa.refresh_token, sa.token_expires_at, sa.account_name, sa.last_error, sa.metadata,
              linked_fb.id AS linked_facebook_account_id, linked_fb.is_active AS linked_facebook_is_active
         FROM social_accounts sa
         LEFT JOIN social_accounts linked_fb
         ON sa.platform = 'instagram'
        AND linked_fb.client_id = sa.client_id
        AND linked_fb.platform = 'facebook'
        AND linked_fb.platform_account_id = sa.metadata->>'via_page_id'
        WHERE sa.id = ANY($1) AND sa.client_id = $2 AND sa.is_active = TRUE`,
      [post.account_ids ?? [], post.client_id]
    )
    return {
      outcome: await publishPost({ ...post, accounts }, input.event ?? undefined),
      accountsCount: accounts.length
    }
  } catch (error) {
    const message = dispatchErrorMessage(error)
    log.error('social-publishing.dispatch.failed', {
      source: input.source,
      postId: post.id,
      clientId: post.client_id,
      error: message
    })
    return {
      outcome: {
        status: 'failed',
        platformResults: {
          [FAILED_DISPATCH_RESULT_KEY]: {
            status: 'failed',
            error: message
          }
        }
      },
      accountsCount: 0
    }
  }
}

function normalizeClaimStatuses(statuses: readonly string[]): string[] {
  const normalized = Array.from(new Set(
    statuses.map(status => status.trim()).filter(Boolean)
  ))
  if (!normalized.length) throw new Error('At least one claim status is required')
  return normalized
}

function dispatchErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  return (message || 'Social publish dispatch failed').slice(0, 300)
}

// ---------------------------------------------------------------------------------------------------
// Delegated (reviewed) dispatch — same claim, same provider services, one attempt per approval.

type DispatchLog = Pick<Console, 'log' | 'warn' | 'error'>

async function publishDelegatedClaim(
  claimed: SocialPostDispatchRow,
  input: ClaimAndPublishSocialPostInput,
  claimStatuses: string[],
  log: DispatchLog
): Promise<ClaimAndPublishSocialPostResult> {
  const revisionId = claimed.approved_revision_id ?? null
  const revision = revisionId
    ? await queryOne<SocialRevisionRow>(
        'SELECT * FROM social_post_revisions WHERE id = $1 AND post_id = $2 AND client_id = $3',
        [revisionId, claimed.id, claimed.client_id]
      )
    : null
  if (!revision) return await holdDelegatedDispatch(claimed, null, 'Approved revision is unavailable', input, log)

  // Fresh authority, never from the payload: the requester must still hold the social_draft grant and
  // the client assignment; the reviewer must still be an active owner/admin other than the requester.
  // Dispatch requests carry no OAuth scope and none is fabricated here.
  const event = input.event
  if (!event) return await releaseDelegatedClaim(claimed, claimStatuses, revision, 'authority_unavailable', log)
  const [
    { assertMarketingCapabilityAtBoundary, isDefinitiveAuthorityDenial, requireIndependentMarketingReviewer },
    { assertSocialMediaAssetsCurrent, socialMediaDeliveryUrl },
    { buildSocialPostSnapshot, socialSnapshotHash },
    effectivePayload
  ] = await delegatedDeps()
  try {
    await assertMarketingCapabilityAtBoundary(event, revision.requested_by, claimed.client_id, 'social_draft')
    await requireIndependentMarketingReviewer(event, {
      requesterId: revision.requested_by,
      clientId: claimed.client_id,
      reviewerId: revision.reviewed_by ?? ''
    })
  } catch (error) {
    if (isDefinitiveAuthorityDenial(error)) {
      return await holdDelegatedDispatch(claimed, revision, 'Requester or reviewer authority changed; a new review is required', input, log)
    }
    return await releaseDelegatedClaim(claimed, claimStatuses, revision, 'authority_unavailable', log)
  }

  // Defense in depth: the live row must still hash to the approved snapshot.
  const snapshot = revision.snapshot as SocialPostSnapshot
  const live = buildSocialPostSnapshot(claimed as unknown as SocialPostReviewRow, snapshot?.media ?? [])
  if (socialSnapshotHash(live) !== revision.content_hash) {
    return await holdDelegatedDispatch(claimed, revision, 'Post changed after approval; a new review is required', input, log)
  }

  // Single-use approval: exactly one dispatch attempt can claim this revision.
  const claimedRevision = await queryOne<{ dispatch_attempt: number }>(
    `UPDATE social_post_revisions
        SET review_status = 'dispatch_claimed', dispatch_claimed_at = NOW(), dispatch_attempt = dispatch_attempt + 1
      WHERE id = $1 AND post_id = $2 AND client_id = $3
        AND review_status = 'approved' AND dispatch_claimed_at IS NULL AND expires_at > NOW()
      RETURNING dispatch_attempt`,
    [revision.id, claimed.id, claimed.client_id]
  )
  if (!claimedRevision) {
    return await holdDelegatedDispatch(claimed, revision, 'Approval was already used or expired', input, log)
  }
  const attempt = Number(claimedRevision.dispatch_attempt)

  let outcome: PublishOutcome
  let accountsCount = 0
  let reserved = false
  try {
    const prepared = await prepareDelegatedPublishablePost(event, claimed, snapshot, { assertSocialMediaAssetsCurrent, socialMediaDeliveryUrl }, effectivePayload)
    if ('error' in prepared) {
      outcome = singleFailure(prepared.error)
    } else {
      accountsCount = prepared.post.accounts.length
      const { reserveSocialTargetAttempts, recordSocialTargetOutcome, recordSocialFirstCommentOutcome } = await import('~~/server/utils/socialPublishing/reconciliation')
      await reserveSocialTargetAttempts(claimed.client_id, claimed.id, revision.id, attempt, prepared.post)
      reserved = true
      outcome = await publishPost(prepared.post, event, (key, result) => recordSocialTargetOutcome(claimed.id, claimed.client_id, revision.id, attempt, key, result),
        (key, result) => recordSocialFirstCommentOutcome(claimed.id, claimed.client_id, revision.id, attempt, key, result))
    }
  } catch (error) {
    // Once reserved, a storage failure or interruption must leave durable evidence held.
    if (reserved) throw error
    // Only local preparation can fail safely before reservation.
    const message = dispatchErrorMessage(error)
    log.error('social-publishing.dispatch.failed', { source: input.source, postId: claimed.id, clientId: claimed.client_id, error: message })
    outcome = singleFailure(message)
  }

  if (reserved) {
    const { finalizeSocialDispatch } = await import('~~/server/utils/socialPublishing/reconciliation')
    outcome = await finalizeSocialDispatch(claimed.id, claimed.client_id, revision.id, attempt, outcome)
  } else {
    await transaction(async (db) => {
      await db.query('SELECT id FROM social_posts WHERE id=$1 AND client_id=$2 FOR UPDATE', [claimed.id, claimed.client_id])
      await db.query(`UPDATE social_post_revisions SET dispatch_outcome=$4 WHERE id=$1 AND post_id=$2 AND client_id=$3
        AND dispatch_attempt=$5 AND review_status='dispatch_claimed' AND dispatch_outcome IS NULL`, [revision.id, claimed.id, claimed.client_id, outcome.status, attempt])
      await db.query(`UPDATE social_posts SET status=$2,platform_results=$3::jsonb,publish_attempts=publish_attempts+1,updated_at=NOW()
        WHERE id=$1 AND client_id=$4 AND current_revision_id=$5 AND approved_revision_id=$5`,
      [claimed.id, outcome.status, JSON.stringify(outcome.platformResults), claimed.client_id, revision.id])
    })
  }
  const targets = Object.keys(outcome.platformResults)
  await recordSocialPublishingAudit({
    clientId: claimed.client_id,
    postId: claimed.id,
    actorId: input.actorId ?? null,
    action: outcome.status === 'unknown' ? 'dispatch_outcome_unknown' : (input.auditAction ?? 'post_published'),
    metadata: {
      source: input.source,
      status: outcome.status,
      targets,
      revisionId: revision.id,
      contentHash: revision.content_hash,
      attempt,
      requesterId: revision.requested_by,
      reviewerId: revision.reviewed_by
    }
  })
  log.log('social-publishing.dispatch.completed', {
    source: input.source,
    postId: claimed.id,
    clientId: claimed.client_id,
    status: outcome.status,
    targets,
    revisionId: revision.id,
    attempt
  })
  return {
    ok: true,
    postId: claimed.id,
    clientId: claimed.client_id,
    status: outcome.status,
    platformResults: outcome.platformResults,
    accountsCount,
    targets,
    revisionId: revision.id
  }
}

function singleFailure(error: string): PublishOutcome {
  return { status: 'failed', platformResults: { [FAILED_DISPATCH_RESULT_KEY]: { status: 'failed', error: error.slice(0, 300) } } }
}

/**
 * Resolve the approved snapshot against CURRENT bindings, read uncached: every exact target must still be
 * an active account of this client on the same platform, and every reviewed media object must still hold
 * the reviewed bytes. The effective per-target payload is resolved with the same helper submission and
 * review used and travels as the server-owned reviewed contract, so publishPost preflights every target
 * before the first provider call and providers deliver the reviewed payload whole or not at all.
 */
async function prepareDelegatedPublishablePost(
  event: H3Event,
  claimed: SocialPostDispatchRow,
  snapshot: SocialPostSnapshot,
  media$: Pick<typeof import('~~/server/utils/socialPublishing/mediaAssets'), 'assertSocialMediaAssetsCurrent' | 'socialMediaDeliveryUrl'>,
  payload$: Pick<typeof import('~~/server/utils/socialPublishing/effectivePayload'), 'resolveEffectiveSocialTargets' | 'effectiveSocialPayloadError'>
): Promise<{ post: PublishablePost } | { error: string }> {
  const targets = Array.isArray(snapshot?.targets) ? snapshot.targets : []
  if (!targets.length) return { error: 'Approved revision has no publishing targets' }
  const accountIds = [...new Set(targets.map(target => target.accountId))]
  const accounts = await queryRowsFresh<PublishableAccount>(
    `SELECT sa.id, sa.client_id, sa.platform, sa.platform_account_id, sa.access_token, sa.refresh_token, sa.token_expires_at, sa.account_name, sa.last_error, sa.metadata,
            linked_fb.id AS linked_facebook_account_id, linked_fb.is_active AS linked_facebook_is_active
       FROM social_accounts sa
       LEFT JOIN social_accounts linked_fb
         ON sa.platform = 'instagram'
        AND linked_fb.client_id = sa.client_id
        AND linked_fb.platform = 'facebook'
        AND linked_fb.platform_account_id = sa.metadata->>'via_page_id'
      WHERE sa.id = ANY($1) AND sa.client_id = $2 AND sa.is_active = TRUE`,
    [accountIds, claimed.client_id]
  )
  const byId = new Map(accounts.map(account => [account.id, account]))
  if (targets.some(target => byId.get(target.accountId)?.platform !== target.platform)) {
    return { error: 'An approved publishing account changed or was disconnected; a new review is required' }
  }
  const media = (Array.isArray(snapshot.media) ? snapshot.media : []) as SocialMediaAssetIdentity[]
  const effective = payload$.resolveEffectiveSocialTargets(snapshot, media)
  const payloadError = payload$.effectiveSocialPayloadError(effective, media)
  if (payloadError) return { error: `Approved payload cannot be delivered as reviewed: ${payloadError}` }
  try {
    await media$.assertSocialMediaAssetsCurrent({ event, clientId: claimed.client_id, identities: media })
  } catch (error) {
    return { error: (error as { statusMessage?: string })?.statusMessage ?? 'Reviewed media is unavailable' }
  }
  const mediaUrls: string[] = []
  for (const identity of media) mediaUrls.push(await media$.socialMediaDeliveryUrl(event, claimed.client_id, identity))
  return {
    post: {
      id: claimed.id,
      content: snapshot.content ?? '',
      media_urls: mediaUrls,
      media_identities: media,
      link_url: snapshot.linkUrl ?? null,
      first_comment: snapshot.firstComment ?? null,
      platforms: [...new Set(targets.map(target => target.platform))],
      publish_targets: targets,
      platform_overrides: (snapshot.platformOverrides ?? {}) as PublishablePost['platform_overrides'],
      accounts: targets.map(target => byId.get(target.accountId)!).filter((account, index, list) => list.indexOf(account) === index),
      reviewed: {
        targets: Object.fromEntries(effective.map(target => [target.key, {
          content: target.content,
          options: target.options,
          firstComment: target.firstComment
        }]))
      }
    }
  }
}

/** A definitive gate failure: no provider call; the approval is spent and the post needs a new review. */
async function holdDelegatedDispatch(
  claimed: SocialPostDispatchRow,
  revision: SocialRevisionRow | null,
  reason: string,
  input: ClaimAndPublishSocialPostInput,
  log: DispatchLog
): Promise<ClaimAndPublishSocialPostResult> {
  await transaction(async (db) => {
    if (revision) {
      await db.query(
        `UPDATE social_post_revisions SET review_status = 'expired'
          WHERE id = $1 AND post_id = $2 AND client_id = $3 AND review_status = 'approved'`,
        [revision.id, claimed.id, claimed.client_id]
      )
      await db.query(
        `UPDATE social_post_revisions SET dispatch_outcome = 'failed'
          WHERE id = $1 AND post_id = $2 AND client_id = $3 AND review_status = 'dispatch_claimed' AND dispatch_outcome IS NULL`,
        [revision.id, claimed.id, claimed.client_id]
      )
    }
    await db.query(
      `UPDATE social_posts
          SET status = 'failed', approved_revision_id = NULL,
              platform_results = $3::jsonb, updated_at = NOW()
        WHERE id = $1 AND client_id = $2 AND status = 'publishing'`,
      [claimed.id, claimed.client_id, JSON.stringify(singleFailure(reason).platformResults)]
    )
    await db.query(
      `INSERT INTO social_publishing_audit_events (client_id, post_id, actor_id, action, metadata)
       VALUES ($1, $2, $3, 'dispatch_held', $4::jsonb)`,
      [claimed.client_id, claimed.id, input.actorId ?? null, JSON.stringify({ source: input.source, reason, revisionId: revision?.id ?? null })]
    )
  })
  log.warn('social-publishing.dispatch.held', { source: input.source, postId: claimed.id, clientId: claimed.client_id, revisionId: revision?.id ?? null, reason })
  return { ok: true, skipped: true, reason: 'review_gate', postId: claimed.id, clientId: claimed.client_id, currentStatus: 'failed', revisionId: revision?.id ?? null }
}

/** Transient authority failure before the revision claim: hand the post back untouched for a later run. */
async function releaseDelegatedClaim(
  claimed: SocialPostDispatchRow,
  claimStatuses: string[],
  revision: SocialRevisionRow,
  reason: 'authority_unavailable',
  log: DispatchLog
): Promise<ClaimAndPublishSocialPostResult> {
  const previous = claimStatuses.length === 1 ? claimStatuses[0]! : 'approved'
  await execute(
    `UPDATE social_posts SET status = $3, updated_at = NOW()
      WHERE id = $1 AND client_id = $2 AND status = 'publishing'`,
    [claimed.id, claimed.client_id, previous]
  )
  log.warn('social-publishing.dispatch.deferred', { postId: claimed.id, clientId: claimed.client_id, revisionId: revision.id, reason })
  return { ok: true, skipped: true, reason, postId: claimed.id, clientId: claimed.client_id, currentStatus: previous, revisionId: revision.id }
}
