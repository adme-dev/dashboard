import type { H3Event } from 'h3'
import { queryTikTokCreatorPostCapabilities } from '~~/server/utils/social-providers/tiktok'
import { tikTokPayloadError } from '~~/shared/tiktokPosting'
/**
 * Social publishing core — shared by the manual publish endpoint and the dispatcher cron.
 *
 *  - resolvePlatformContent: merge base content with per-network platform_overrides.
 *  - stampUtms: append UTM params to a post's outbound link.
 *  - publishPost: run one post across all its platforms via the provider registry,
 *    returning an aggregated status + per-network results. The caller persists
 *    platform_results / status to social_posts.
 */
import { getProviderOrThrow } from '~~/server/utils/social-providers/registry'
import { redactSocialMediaCapabilities } from '~~/server/utils/social-providers/http'
import { execute, queryOne, queryOneFresh } from '~~/server/utils/db'
import { resolveSocialAccountAccessToken } from '~~/server/utils/socialInbox/tokenRefresh'
import { providerAccountOperationEligibility } from '~~/server/utils/socialPublishing/capabilityReadiness'
import { classifySocialPublishingAccountHealth } from '~~/server/utils/socialPublishing/accountHealth'
import { productionReadyPublishPlatformsError } from '~~/server/utils/socialPublishing/platformReadiness'
import {
  buildPublishContent,
  resolveEffectiveSocialTargets,
  tikTokConsentIdentity,
  buildPublishOptions,
  resolvePlatformContent,
  resolvePlatformOptions,
  stampUtms,
  type BaseContent,
  type PlatformOverride
} from '~~/server/utils/socialPublishing/effectivePayload'

// Copy/link composition lives in effectivePayload.ts so reviewed submission, review and dispatch share it.
export { resolvePlatformContent, resolvePlatformOptions, stampUtms, type BaseContent, type PlatformOverride }

/** Classify a media URL as video or image for provider dispatch. Render links + .mp4/.mov → video. */
export function mediaTypeForUrl(url: string): 'video' | 'image' {
  const u = url.toLowerCase()
  if (/\.(mp4|mov|webm|m4v)(\?|$)/.test(u) || u.includes('/api/public/renders/') || u.includes('/api/public/video-assets/')) return 'video'
  return 'image'
}

export interface PublishableAccount {
  id: string
  /** Present on fresh delegated reads; legacy callers need not supply tenancy here. */
  client_id?: string
  platform: string
  platform_account_id: string
  access_token: string
  refresh_token?: string | null
  token_expires_at?: string | null
  account_name: string | null
  linked_facebook_account_id?: string | null
  linked_facebook_is_active?: boolean | null
  last_error?: string | null
  metadata?: Record<string, unknown> | null
}

export interface PublishablePost {
  id: string
  content: string
  hashtags?: string[] | null
  media_urls: string[] | null
  media_identities?: Array<{ mediaType: string, durationSeconds?: number | null }>
  link_url: string | null
  first_comment?: string | null
  platforms: string[]
  publish_targets?: PublishTarget[] | null
  platform_overrides: Record<string, PlatformOverride>
  accounts: PublishableAccount[]
  /** Server-owned reviewed-payload contract (approved delegated revision). Never set from request input. */
  reviewed?: ReviewedPublishContract
}

/** The exact payload one reviewed target delivers, resolved by effectivePayload.resolveEffectiveSocialTargets. */
export interface ReviewedTargetPayload {
  content: string
  options: Record<string, unknown>
  firstComment: string | null
}

/**
 * Reviewed dispatch: every exact target is preflighted (readiness, reconnect, prerequisites, provider,
 * credentials) before the first publication request, the effective copy/options are delivered as
 * reviewed, and providers must publish all approved media or fail before publishing.
 */
export interface ReviewedPublishContract {
  /** Keyed by `${platform}:${accountId}`. */
  targets: Record<string, ReviewedTargetPayload>
}

export interface PublishTarget {
  platform: string
  accountId: string
  options?: Record<string, unknown>
}

export interface PublishTargetResult {
  status: string
  platform?: string
  accountId?: string
  platformAccountId?: string
  accountName?: string | null
  platformPostId?: string
  url?: string
  error?: string | null
  providerStatus?: string
  providerReceipt?: { code: string | null, logId: string | null }
  publicPostIds?: string[]
  nextPollAt?: string | null
  firstComment?: {
    status: string
    platformPostId?: string
    url?: string
    error?: string | null
  }
}

/**
 * `unknown` = at least one target may have reached the provider without a definitive answer (transport
 * failure, timeout, or an accepted response without a receipt). Such a post is held for read-back and is
 * never re-claimed automatically. An explicit provider rejection remains `failed`.
 */
export interface PublishOutcome {
  status: 'published' | 'partially_published' | 'failed' | 'unknown' | 'accepted'
  platformResults: Record<string, PublishTargetResult>
}

/** Publish a post across every platform it targets, aggregating per-network results. */
export async function publishPost(post: PublishablePost, event?: H3Event, onTargetResult?: (key: string, result: PublishTargetResult) => Promise<void>, onFirstCommentResult?: (key: string, result: NonNullable<PublishTargetResult['firstComment']>) => Promise<void>): Promise<PublishOutcome> {
  if (post.reviewed) return await publishReviewedPost(post, post.reviewed, event, onTargetResult, onFirstCommentResult)
  const base: BaseContent = { content: post.content, mediaUrls: post.media_urls ?? [] }
  const results: PublishOutcome['platformResults'] = {}
  let ok = 0
  let fail = 0
  let unknown = 0
  const explicitTargets = normalizeStoredPublishTargets(post.publish_targets)

  if (explicitTargets.length) {
    const accountsById = new Map(post.accounts.map(account => [account.id, account]))
    for (const target of explicitTargets) {
      const account = accountsById.get(target.accountId)
      const resultKey = `${target.platform}:${target.accountId}`
      if (!account || account.platform !== target.platform) {
        results[resultKey] = {
          status: 'failed',
          platform: target.platform,
          accountId: target.accountId,
          error: 'No connected account'
        }
        logPublishTargetFailure(post.id, target.platform, resultKey, null, 'No connected account')
        fail++
        continue
      }
      const resolved = resolvePlatformContent(base, post.platform_overrides ?? {}, target.platform)
      const targetOutcome = await publishResolvedTarget(post, target.platform, account, resultKey, resolved, target.options ?? {}, event)
      results[resultKey] = targetOutcome.result
      ok += targetOutcome.ok
      fail += targetOutcome.fail
      unknown += targetOutcome.unknown ?? 0
    }
  } else {
    for (const platform of post.platforms) {
      const accounts = post.accounts.filter(a => a.platform === platform)
      if (!accounts.length) {
        results[platform] = { status: 'failed', error: 'No connected account' }
        logPublishTargetFailure(post.id, platform, platform, null, 'No connected account')
        fail++
        continue
      }
      const resolved = resolvePlatformContent(base, post.platform_overrides ?? {}, platform)
      for (const account of accounts) {
        const resultKey = publishResultKey(platform, account, accounts.length)
        const targetOutcome = await publishResolvedTarget(post, platform, account, resultKey, resolved, {}, event)
        results[resultKey] = targetOutcome.result
        ok += targetOutcome.ok
        fail += targetOutcome.fail
        unknown += targetOutcome.unknown ?? 0
      }
    }
  }

  return { status: outcomeStatus(ok, fail, unknown, Object.values(results).filter(r => r.status === 'accepted').length), platformResults: results }
}

export function outcomeStatus(ok: number, fail: number, unknown: number, accepted = 0): PublishOutcome['status'] {
  return unknown > 0
    ? 'unknown'
    : accepted > 0 ? 'accepted' : fail === 0 ? 'published' : ok === 0 ? 'failed' : 'partially_published'
}

type TargetOutcome = { result: PublishTargetResult, ok: number, fail: number, unknown?: number }

interface PreparedTarget {
  platform: string
  account: PublishableAccount
  resultKey: string
  provider: ReturnType<typeof getProviderOrThrow>
  accountId: string
  accessToken: string
  content: string
  media: Array<{ url: string, type: 'video' | 'image', durationSeconds?: number | null }>
  options: Record<string, unknown>
  firstComment: string | null
  reviewed: boolean
}

/**
 * Local preparation for one target: readiness, reconnect state, media prerequisites, provider and
 * credentials. Nothing here contacts the publication endpoint, so every failure is effect-free.
 */
async function prepareTarget(
  platform: string,
  account: PublishableAccount,
  resultKey: string,
  mediaUrls: string[],
  payload: (target: { options: Record<string, unknown> }) => { content: string, options: Record<string, unknown>, firstComment: string | null },
  reviewed: boolean,
  event?: H3Event,
  mediaIdentities?: PublishablePost['media_identities']
): Promise<{ prepared: PreparedTarget } | { error: string }> {
  const localError = publishTargetPreflightError(platform, account, mediaUrls)
  if (localError) return { error: localError }
  const firstComment = payload({ options: {} }).firstComment
  if (reviewed) {
    const eligibilityError = reviewedAccountEligibilityError(account, firstComment)
    if (eligibilityError) return { error: eligibilityError }
  }
  try {
    const provider = getProviderOrThrow(platform)
    const target = await resolvePublishTarget(account, reviewed, event)
    // Refresh/CAS may replace token and grants; check the fresh winning account, including comments.
    if (reviewed) {
      const eligibilityError = reviewedAccountEligibilityError(account, firstComment)
      if (eligibilityError) return { error: eligibilityError }
    }
    const built = payload(target)
    if (platform === 'tiktok') {
      if (built.options.consentAccountId !== account.platform_account_id) return {error:'TikTok account changed; renew consent'}
      if (!reviewed && built.options.consentPayload !== tikTokConsentIdentity({accountId:account.id,content:built.content,options:built.options},mediaUrls)) return {error:'TikTok consent must be renewed for this exact payload'}
      const creator = await queryTikTokCreatorPostCapabilities(target.accessToken)
      const problem = tikTokPayloadError(built.content, mediaIdentities ?? mediaUrls.map(url => ({ mediaType: mediaTypeForUrl(url) })), built.options, creator)
      if (problem) return { error: problem }
    }
    return {
      prepared: {
        platform,
        account,
        resultKey,
        provider,
        accountId: target.accountId,
        accessToken: target.accessToken,
        content: built.content,
        media: mediaUrls.map((url, index) => ({ url, type: mediaTypeForUrl(url), ...(mediaIdentities?.[index]?.durationSeconds != null ? { durationSeconds: mediaIdentities[index]!.durationSeconds } : {}) })),
        options: built.options,
        firstComment: built.firstComment,
        reviewed
      }
    }
  } catch (e: unknown) {
    return { error: errorMessage(e) }
  }
}

/** Known local reasons a target cannot publish (no provider contact). Shared by legacy and reviewed paths. */
export function publishTargetPreflightError(platform: string, account: PublishableAccount, mediaUrls: string[]): string | null {
  return productionReadyPublishPlatformsError([platform])
    ?? publishingAccountError(account)
    ?? publishPrerequisiteError(platform, mediaUrls)
}

async function publishResolvedTarget(
  post: PublishablePost,
  platform: string,
  account: PublishableAccount,
  resultKey: string,
  resolved: BaseContent,
  targetOptions: Record<string, unknown>,
  event?: H3Event
): Promise<TargetOutcome> {
  const preparation = await prepareTarget(platform, account, resultKey, resolved.mediaUrls, target => {
    const effective = resolveEffectiveSocialTargets({
      postId:post.id,content:resolved.content,hashtags:post.hashtags,linkUrl:post.link_url,firstComment:post.first_comment,
      targets:[{platform,accountId:account.id,options:{...resolvePlatformOptions(post.platform_overrides ?? {},platform),...targetOptions,...target.options}}]
    },post.media_identities ?? resolved.mediaUrls.map(url=>({mediaType:mediaTypeForUrl(url)})))[0]!
    return {content:effective.content,options:effective.options,firstComment:effective.firstComment}
  }, false, event, post.media_identities)
  if ('error' in preparation) {
    logPublishTargetFailure(post.id, platform, resultKey, account, preparation.error)
    return { result: publishResult(account, { status: 'failed', error: preparation.error }), ok: 0, fail: 1 }
  }
  return await executePreparedTarget(post.id, preparation.prepared)
}

/**
 * Reviewed (delegated) dispatch. Phase 1 prepares EVERY exact target; any known local problem fails the
 * whole post before a single publication request (no partial fan-out a reviewer did not approve).
 * Phase 2 publishes the effective reviewed payload target by target.
 */
async function publishReviewedPost(post: PublishablePost, reviewed: ReviewedPublishContract, event?: H3Event, onTargetResult?: (key: string, result: PublishTargetResult) => Promise<void>, onFirstCommentResult?: (key: string, result: NonNullable<PublishTargetResult['firstComment']>) => Promise<void>): Promise<PublishOutcome> {
  const targets = normalizeStoredPublishTargets(post.publish_targets)
  const accountsById = new Map(post.accounts.map(account => [account.id, account]))
  const mediaUrls = post.media_urls ?? []
  const prepared: PreparedTarget[] = []
  let preflightFailure: { resultKey: string, platform: string, accountId: string, account: PublishableAccount | null, error: string } | null = null

  if (!targets.length) {
    preflightFailure = { resultKey: 'dispatch', platform: '', accountId: '', account: null, error: 'Reviewed post has no publishing targets' }
  }
  for (const target of targets) {
    const resultKey = `${target.platform}:${target.accountId}`
    const account = accountsById.get(target.accountId)
    const payload = reviewed.targets[resultKey]
    if (!account || account.platform !== target.platform) {
      preflightFailure = { resultKey, platform: target.platform, accountId: target.accountId, account: null, error: 'No connected account' }
      break
    }
    if (!payload) {
      preflightFailure = { resultKey, platform: target.platform, accountId: target.accountId, account, error: 'Reviewed payload is missing for this target' }
      break
    }
    const preparation = await prepareTarget(target.platform, account, resultKey, mediaUrls, accountTarget => ({
      content: payload.content,
      // Account-derived options (LinkedIn author) are added last, exactly as for legacy posts.
      options: { ...payload.options, ...accountTarget.options },
      firstComment: normalizeOptionalText(payload.firstComment)
    }), true, event, post.media_identities)
    if ('error' in preparation) {
      preflightFailure = { resultKey, platform: target.platform, accountId: target.accountId, account, error: preparation.error }
      break
    }
    prepared.push(preparation.prepared)
  }

  if (preflightFailure) {
    const results: PublishOutcome['platformResults'] = {}
    const failed = preflightFailure
    const error = `Preflight: ${redact(failed.error)}`
    logPublishTargetFailure(post.id, failed.platform, failed.resultKey, failed.account, error)
    for (const target of targets) {
      const resultKey = `${target.platform}:${target.accountId}`
      const account = accountsById.get(target.accountId) ?? null
      const targetError = resultKey === failed.resultKey
        ? error
        : 'Not attempted: another approved target failed preflight; nothing was published'
      results[resultKey] = account && account.platform === target.platform
        ? publishResult(account, { status: 'failed', error: targetError })
        : { status: 'failed', platform: target.platform, accountId: target.accountId, error: targetError }
    }
    if (!targets.length) results[failed.resultKey] = { status: 'failed', error }
    for (const [key, result] of Object.entries(results)) await onTargetResult?.(key, result)
    return { status: 'failed', platformResults: results }
  }

  const results: PublishOutcome['platformResults'] = {}
  let ok = 0
  let fail = 0
  let unknown = 0
  for (const target of prepared) {
    const outcome = await executePreparedTarget(post.id, target, onTargetResult, onFirstCommentResult)
    results[target.resultKey] = outcome.result
    ok += outcome.ok
    fail += outcome.fail
    unknown += outcome.unknown ?? 0
  }
  return { status: outcomeStatus(ok, fail, unknown, Object.values(results).filter(r => r.status === 'accepted').length), platformResults: results }
}

/** The provider request(s) for one prepared target, then its first comment. */
async function executePreparedTarget(postId: string, target: PreparedTarget,
  onTargetResult?: (key: string, result: PublishTargetResult) => Promise<void>,
  onFirstCommentResult?: (key: string, result: NonNullable<PublishTargetResult['firstComment']>) => Promise<void>
): Promise<TargetOutcome> {
  const { platform, account, resultKey, provider } = target
  let r: Awaited<ReturnType<typeof provider.post>>
  try {
    r = await provider.post({
      accountId: target.accountId,
      accessToken: target.accessToken,
      content: target.content,
      media: target.media,
      options: target.options,
      ...(target.reviewed ? { reviewed: true } : {})
    })
  } catch (e: unknown) {
    // The request may have reached the provider: hold for read-back, never retry blindly.
    const error = redact(errorMessage(e))
    logPublishTargetFailure(postId, platform, resultKey, account, error)
    const result = publishResult(account, { status: 'unknown', error })
    await onTargetResult?.(resultKey, result)
    return { result, ok: 0, fail: 0, unknown: 1 }
  }
  if ((r.status !== 'success' && r.indeterminate) || (['success', 'accepted'].includes(r.status) && !r.platformPostId)) {
    const error = redact(r.error ?? 'Provider accepted the request without a post receipt')
    logPublishTargetFailure(postId, platform, resultKey, account, error)
    const result = publishResult(account, { status: 'unknown', error, ...(r.providerReceipt ? { providerReceipt: r.providerReceipt } : {}) })
    await onTargetResult?.(resultKey, result)
    return { result, ok: 0, fail: 0, unknown: 1 }
  }
  const result = publishResult(account, {
    status: r.status,
    platformPostId: r.platformPostId,
    url: r.url,
    ...(r.providerStatus ? { providerStatus: r.providerStatus } : {}),
    ...(r.providerReceipt ? { providerReceipt: r.providerReceipt } : {}),
    error: r.error ? redact(r.error) : null
  })
  // Publication evidence is committed before any subsequent provider request. Until a separate
  // comment receipt arrives, its delivery is unknown and must never be retried automatically.
  if (r.status === 'success' && target.firstComment) result.firstComment = { status: 'unknown' }
  await onTargetResult?.(resultKey, result)
  if (r.status === 'accepted') return { result, ok: 0, fail: 0 }
  if (r.status !== 'success') {
    logPublishTargetFailure(postId, platform, resultKey, account, result.error ?? `Provider returned ${r.status}`)
    return { result, ok: 0, fail: 1 }
  }

  // The post itself is live from here on; a first-comment problem never downgrades its receipt.
  let fail = 0
  try {
    const commentResult = await publishFirstComment({
      provider,
      accountId: target.accountId,
      accessToken: target.accessToken,
      platformPostId: r.platformPostId,
      content: target.firstComment,
      options: target.options,
      reviewed: target.reviewed
    })
    if (commentResult) {
      result.firstComment = commentResult.result
      if (commentResult.failed) {
        logPublishTargetFailure(postId, platform, resultKey, account, commentResult.result.error ?? 'First comment failed')
        fail++
      }
    }
  } catch (e: unknown) {
    const error = redact(errorMessage(e))
    result.firstComment = { status: 'unknown', error }
    logPublishTargetFailure(postId, platform, resultKey, account, error)
    fail++
  }
  if (result.firstComment) await onFirstCommentResult?.(resultKey, result.firstComment)
  return { result, ok: 1, fail }
}

/** Provider and download errors can carry our signed reviewed-media URLs: never store or log them. */
function redact(text: string): string {
  return redactSocialMediaCapabilities(text)
}

function normalizeStoredPublishTargets(value: PublishTarget[] | null | undefined): PublishTarget[] {
  return Array.isArray(value)
    ? value.filter(target => target?.platform && target?.accountId)
    : []
}

function publishResultKey(platform: string, account: PublishableAccount, platformAccountCount: number): string {
  return platformAccountCount > 1 ? `${platform}:${account.id}` : platform
}

function publishResult(
  account: PublishableAccount,
  result: Omit<PublishTargetResult, 'platform' | 'accountId' | 'platformAccountId' | 'accountName'>
): PublishTargetResult {
  return {
    ...result,
    platform: account.platform,
    accountId: account.id,
    platformAccountId: account.platform_account_id,
    accountName: account.account_name
  }
}

async function publishFirstComment(params: {
  provider: ReturnType<typeof getProviderOrThrow>
  accountId: string
  accessToken: string
  platformPostId: string
  content: string | null
  options?: Record<string, unknown>
  reviewed?: boolean
}): Promise<{ result: NonNullable<PublishTargetResult['firstComment']>, failed: boolean } | null> {
  if (!params.content) return null
  if (!params.platformPostId) {
    return {
      result: { status: 'failed', error: 'Cannot publish first comment without a platform post id' },
      failed: true
    }
  }
  if (!params.provider.comment) {
    return {
      result: { status: 'skipped', error: 'Provider does not support first comments' },
      failed: false
    }
  }

  const result = await params.provider.comment({
    accountId: params.accountId,
    accessToken: params.accessToken,
    postId: params.platformPostId,
    content: params.content,
    options: params.options,
    ...(params.reviewed ? { reviewed: true } : {})
  })

  return {
    result: {
      status: result.indeterminate || (result.status === 'success' && !result.platformPostId) ? 'unknown' : result.status,
      platformPostId: result.platformPostId,
      url: result.url,
      error: result.error ? redact(result.error) : null
    },
    failed: result.status !== 'success' || !result.platformPostId
  }
}

function logPublishTargetFailure(
  postId: string,
  platform: string,
  resultKey: string,
  account: PublishableAccount | null,
  error: string
) {
  console.warn('social-publish.target_failed', {
    postId,
    platform,
    resultKey,
    accountId: account?.id ?? null,
    platformAccountId: account?.platform_account_id ?? null,
    error: redact(error)
  })
}

export function publishedTargetsForAccount(
  postId: string,
  platformResults: Record<string, unknown> | null | undefined,
  account: Pick<PublishableAccount, 'id' | 'platform' | 'platform_account_id'>
): Array<{ postId: string, platformPostId: string }> {
  if (!platformResults || typeof platformResults !== 'object') return []
  const targets: Array<{ postId: string, platformPostId: string }> = []

  for (const [key, raw] of Object.entries(platformResults)) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue
    const result = raw as Record<string, unknown>
    if (['accepted', 'unknown', 'failed'].includes(String(result.status))) continue
    const [keyPlatform, keyAccountId] = key.split(':')
    const resultPlatform = typeof result.platform === 'string' ? result.platform : keyPlatform
    if (resultPlatform !== account.platform) continue

    const resultAccountId = typeof result.accountId === 'string' ? result.accountId : null
    const resultPlatformAccountId = typeof result.platformAccountId === 'string' ? result.platformAccountId : null
    if (resultAccountId && resultAccountId !== account.id) continue
    if (!resultAccountId && keyAccountId && keyAccountId !== account.id) continue
    if (!resultAccountId && !keyAccountId && resultPlatformAccountId && resultPlatformAccountId !== account.platform_account_id) continue

    // TikTok publish_id identifies processing, never a metrics post. Use confirmed public IDs only.
    if (resultPlatform === 'tiktok') {
      if (result.providerStatus === 'PUBLISH_COMPLETE' && Array.isArray(result.publicPostIds)) {
        for (const id of result.publicPostIds) if (typeof id === 'string' && /^\d{1,64}$/.test(id)) targets.push({ postId, platformPostId: id })
      }
      continue
    }
    const platformPostId = typeof result.platformPostId === 'string' ? result.platformPostId : ''
    if (platformPostId) targets.push({ postId, platformPostId })
  }

  return targets
}

function publishPrerequisiteError(platform: string, mediaUrls: string[]): string | null {
  if (platform === 'instagram' && mediaUrls.length === 0) {
    return 'Instagram requires media to publish'
  }
  if (platform === 'youtube' && !mediaUrls.some(url => mediaTypeForUrl(url) === 'video')) {
    return 'YouTube requires video media to publish'
  }
  return null
}

/** Governed reviewed targets require known provider grants; legacy callers retain their existing policy. */
function reviewedAccountEligibilityError(account: PublishableAccount, firstComment?: string | null): string | null {
  const operations = firstComment ? ['organic_publish', 'organic_comment'] as const : ['organic_publish'] as const
  for (const operation of operations) {
    const eligibility = providerAccountOperationEligibility({
      platform: account.platform, isActive: true, lastError: account.last_error,
      tokenExpiresAt: account.token_expires_at, hasRefreshToken: Boolean(account.refresh_token),
      metadata: account.metadata, linkedFacebookAccountId: account.linked_facebook_account_id,
      linkedFacebookIsActive: account.linked_facebook_is_active
    }, operation)
    if (eligibility.state !== 'available') return eligibility.reason
  }
  return null
}

function publishingAccountError(account: PublishableAccount): string | null {
  const health = classifySocialPublishingAccountHealth({
    platform: account.platform,
    isActive: true,
    lastError: account.last_error,
    tokenExpiresAt: account.token_expires_at,
    hasRefreshToken: Boolean(account.refresh_token),
    metadata: account.metadata ?? null,
    linkedFacebookAccountId: account.linked_facebook_account_id,
    linkedFacebookIsActive: account.linked_facebook_is_active
  })

  return health.requiresReconnect || health.health === 'reconnect'
    ? 'Publishing account requires reconnect'
    : null
}

function normalizeOptionalText(value: string | null | undefined): string | null {
  const text = value?.trim()
  return text ? text : null
}

async function resolvePublishTarget(account: PublishableAccount, reviewed = false, event?: H3Event): Promise<{
  accountId: string
  accessToken: string
  options: Record<string, unknown>
}> {
  if (account.platform === 'linkedin') {
    return {
      accountId: account.platform_account_id,
      accessToken: await refreshableAccessToken(account, reviewed, event),
      options: { isOrganization: linkedInAccountIsOrganization(account) }
    }
  }

  if (account.platform === 'tiktok') return { accountId: account.platform_account_id, accessToken: await refreshableAccessToken(account, reviewed, event), options: {} }

  if (account.platform !== 'google-business') {
    return { accountId: account.platform_account_id, accessToken: account.access_token, options: {} }
  }

  const metadata = account.metadata ?? {}
  const [fallbackAccountId, fallbackLocationId] = account.platform_account_id.split(':')
  const accountId = String(metadata.googleBusinessAccountId || fallbackAccountId || '')
  const locationId = String(metadata.googleBusinessLocationId || fallbackLocationId || '')
  if (!accountId || !locationId) {
    throw new Error('Google Business Profile account is missing account/location metadata')
  }

  return {
    accountId,
    accessToken: await refreshableAccessToken(account, reviewed, event),
    options: { locationId }
  }
}

/**
 * LinkedIn rows created by organization discovery carry `linkedinOrganizationUrn`; any row
 * without an explicit `linkedinAuthorType: 'person'` publishes as the organization.
 */
export function linkedInAccountIsOrganization(account: Pick<PublishableAccount, 'metadata'>): boolean {
  return account.metadata?.linkedinAuthorType !== 'person'
}

/** Refresh an expired/near-expiry OAuth token (when a refresh token exists) and persist it. */
export async function refreshableAccessToken(account: PublishableAccount, reviewed: boolean, event?: H3Event): Promise<string> {
  if (account.platform === 'tiktok' && publishingAccountError(account)) throw new Error('TikTok account requires reconnect')
  if (!account.refresh_token) return account.access_token
  // Refresh can await a provider while an operator reconnects, disconnects or reassigns the account.
  // Keep legacy refresh semantics, but scope delegated writes and read the winner uncached. A missing
  // binding must throw rather than letting the shared refresh helper fall back to the losing token.
  const currentBinding = async () => {
    const current = account.client_id ? await queryOneFresh<PublishableAccount>(
      `SELECT sa.id, sa.client_id, sa.platform, sa.platform_account_id, sa.access_token, sa.refresh_token,
              sa.token_expires_at, sa.account_name, sa.last_error, sa.metadata,
              linked_fb.id AS linked_facebook_account_id, linked_fb.is_active AS linked_facebook_is_active
         FROM social_accounts sa
         LEFT JOIN social_accounts linked_fb
         ON sa.platform = 'instagram'
        AND linked_fb.client_id = sa.client_id
        AND linked_fb.platform = 'facebook'
        AND linked_fb.platform_account_id = sa.metadata->>'via_page_id'
        WHERE sa.id = $1 AND sa.client_id = $2 AND sa.platform = $3 AND sa.platform_account_id = $4 AND sa.is_active = TRUE`,
      [account.id, account.client_id, account.platform, account.platform_account_id]
    ) : null
    if (!current || !current.access_token || publishingAccountError(current) || reviewedAccountEligibilityError(current)
      || linkedInAccountIsOrganization(current) !== linkedInAccountIsOrganization(account)) {
      throw new Error('Reviewed publishing account changed during token refresh; a new review is required')
    }
    return current
  }
  const db = reviewed ? {
    execute: (sql: string, params: unknown[] = []) => execute(
      `${sql} AND client_id = $${params.length + 1} AND platform = $${params.length + 2}
        AND platform_account_id = $${params.length + 3} AND is_active = TRUE`,
      [...params, account.client_id, account.platform, account.platform_account_id]
    ),
    queryOne: async <T>() => await currentBinding() as T
  } : { execute, queryOne }
  const token = await resolveSocialAccountAccessToken({
    event,
    db,
    account: {
      id: account.id,
      platform: account.platform,
      access_token: account.access_token,
      refresh_token: account.refresh_token,
      metadata: account.metadata,
      token_expires_at: account.token_expires_at ?? null
    }
  })
  if (!reviewed) return token
  const current = await currentBinding()
  Object.assign(account, current)
  return current.access_token
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'publish failed'
}
