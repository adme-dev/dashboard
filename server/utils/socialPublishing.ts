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
import { execute } from '~~/server/utils/db'
import { resolveSocialAccountAccessToken } from '~~/server/utils/socialInbox/tokenRefresh'
import { classifySocialPublishingAccountHealth } from '~~/server/utils/socialPublishing/accountHealth'
import { productionReadyPublishPlatformsError } from '~~/server/utils/socialPublishing/platformReadiness'

/** Classify a media URL as video or image for provider dispatch. Render links + .mp4/.mov → video. */
export function mediaTypeForUrl(url: string): 'video' | 'image' {
  const u = url.toLowerCase()
  if (/\.(mp4|mov|webm|m4v)(\?|$)/.test(u) || u.includes('/api/public/renders/') || u.includes('/api/public/video-assets/')) return 'video'
  return 'image'
}

export interface BaseContent {
  content: string
  mediaUrls: string[]
}

export interface PlatformOverride {
  content?: string
  mediaUrls?: string[]
  options?: Record<string, unknown>
}

/** Resolve the content for one platform: per-network override merged over the base. */
export function resolvePlatformContent(
  base: BaseContent,
  overrides: Record<string, PlatformOverride>,
  platform: string
): BaseContent {
  const ov = overrides?.[platform]
  if (!ov) return { content: base.content, mediaUrls: base.mediaUrls }
  return {
    content: ov.content ?? base.content,
    mediaUrls: ov.mediaUrls ?? base.mediaUrls
  }
}

/** Append UTM tracking params to an outbound link. Returns null for a null url, original on parse failure. */
export function stampUtms(url: string | null, platform: string, postId: string): string | null {
  if (!url) return null
  try {
    const u = new URL(url)
    u.searchParams.set('utm_source', platform)
    u.searchParams.set('utm_medium', 'social')
    u.searchParams.set('utm_campaign', `post_${postId}`)
    return u.toString()
  } catch {
    return url
  }
}

export interface PublishableAccount {
  id: string
  platform: string
  platform_account_id: string
  access_token: string
  refresh_token?: string | null
  token_expires_at?: string | null
  account_name: string | null
  last_error?: string | null
  metadata?: Record<string, unknown> | null
}

export interface PublishablePost {
  id: string
  content: string
  media_urls: string[] | null
  link_url: string | null
  first_comment?: string | null
  platforms: string[]
  publish_targets?: PublishTarget[] | null
  platform_overrides: Record<string, PlatformOverride>
  accounts: PublishableAccount[]
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
  firstComment?: {
    status: string
    platformPostId?: string
    url?: string
    error?: string | null
  }
}

export interface PublishOutcome {
  status: 'published' | 'partially_published' | 'failed'
  platformResults: Record<string, PublishTargetResult>
}

/** Publish a post across every platform it targets, aggregating per-network results. */
export async function publishPost(post: PublishablePost): Promise<PublishOutcome> {
  const base: BaseContent = { content: post.content, mediaUrls: post.media_urls ?? [] }
  const results: PublishOutcome['platformResults'] = {}
  let ok = 0
  let fail = 0
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
      const targetOutcome = await publishResolvedTarget(post, target.platform, account, resultKey, resolved, target.options ?? {})
      results[resultKey] = targetOutcome.result
      ok += targetOutcome.ok
      fail += targetOutcome.fail
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
        const targetOutcome = await publishResolvedTarget(post, platform, account, resultKey, resolved, {})
        results[resultKey] = targetOutcome.result
        ok += targetOutcome.ok
        fail += targetOutcome.fail
      }
    }
  }

  const status: PublishOutcome['status'] = fail === 0 ? 'published' : ok === 0 ? 'failed' : 'partially_published'
  return { status, platformResults: results }
}

async function publishResolvedTarget(
  post: PublishablePost,
  platform: string,
  account: PublishableAccount,
  resultKey: string,
  resolved: BaseContent,
  targetOptions: Record<string, unknown>
): Promise<{ result: PublishTargetResult, ok: number, fail: number }> {
  const productionReadyError = productionReadyPublishPlatformsError([platform])
  if (productionReadyError) {
    logPublishTargetFailure(post.id, platform, resultKey, account, productionReadyError)
    return {
      result: publishResult(account, { status: 'failed', error: productionReadyError }),
      ok: 0,
      fail: 1
    }
  }

  const accountError = publishingAccountError(account)
  if (accountError) {
    logPublishTargetFailure(post.id, platform, resultKey, account, accountError)
    return {
      result: publishResult(account, { status: 'failed', error: accountError }),
      ok: 0,
      fail: 1
    }
  }

  const prerequisiteError = publishPrerequisiteError(platform, resolved.mediaUrls)
  if (prerequisiteError) {
    logPublishTargetFailure(post.id, platform, resultKey, account, prerequisiteError)
    return {
      result: publishResult(account, { status: 'failed', error: prerequisiteError }),
      ok: 0,
      fail: 1
    }
  }

  const link = stampUtms(post.link_url, platform, post.id)
  const firstComment = normalizeOptionalText(post.first_comment)
  try {
    const provider = getProviderOrThrow(platform)
    const target = await resolvePublishTarget(account)
    const publishOptions = buildPublishOptions(
      platform,
      {
        ...resolvePlatformOptions(post.platform_overrides ?? {}, platform),
        ...targetOptions,
        ...target.options
      },
      link
    )
    const r = await provider.post({
      accountId: target.accountId,
      accessToken: target.accessToken,
      content: buildPublishContent(platform, resolved.content, link),
      media: resolved.mediaUrls.map(url => ({ url, type: mediaTypeForUrl(url) })),
      options: publishOptions
    })
    const result = publishResult(account, {
      status: r.status,
      platformPostId: r.platformPostId,
      url: r.url,
      error: r.error ?? null
    })
    let fail = 0
    if (r.status === 'success') {
      const commentResult = await publishFirstComment({
        provider,
        accountId: target.accountId,
        accessToken: target.accessToken,
        platformPostId: r.platformPostId,
        content: firstComment
      })
      if (commentResult) {
        result.firstComment = commentResult.result
        if (commentResult.failed) {
          logPublishTargetFailure(post.id, platform, resultKey, account, commentResult.result.error ?? 'First comment failed')
          fail++
        }
      }
    } else {
      logPublishTargetFailure(post.id, platform, resultKey, account, r.error ?? `Provider returned ${r.status}`)
      fail++
    }

    return { result, ok: r.status === 'success' ? 1 : 0, fail }
  } catch (e: unknown) {
    const error = errorMessage(e)
    logPublishTargetFailure(post.id, platform, resultKey, account, error)
    return {
      result: publishResult(account, { status: 'failed', error }),
      ok: 0,
      fail: 1
    }
  }
}

function normalizeStoredPublishTargets(value: PublishTarget[] | null | undefined): PublishTarget[] {
  return Array.isArray(value)
    ? value.filter(target => target?.platform && target?.accountId)
    : []
}

export function resolvePlatformOptions(
  overrides: Record<string, PlatformOverride>,
  platform: string
): Record<string, unknown> {
  return overrides?.[platform]?.options ?? {}
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

function buildPublishOptions(
  platform: string,
  targetOptions: Record<string, unknown>,
  link: string | null
): Record<string, unknown> {
  const options = { ...targetOptions }
  if (!link) return options

  if (platform === 'facebook') {
    options.link = link
  }

  if (platform === 'google-business' && !options.callToAction) {
    options.callToAction = { actionType: 'LEARN_MORE', url: link }
  }

  return options
}

function buildPublishContent(platform: string, content: string, link: string | null): string {
  if (!link || platformSupportsStructuredLink(platform)) return content
  return `${content}\n${link}`
}

function platformSupportsStructuredLink(platform: string): boolean {
  return platform === 'facebook' || platform === 'google-business'
}

async function publishFirstComment(params: {
  provider: ReturnType<typeof getProviderOrThrow>
  accountId: string
  accessToken: string
  platformPostId: string
  content: string | null
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
    content: params.content
  })

  return {
    result: {
      status: result.status,
      platformPostId: result.platformPostId,
      url: result.url,
      error: result.error ?? null
    },
    failed: result.status !== 'success'
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
    error
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
    const [keyPlatform, keyAccountId] = key.split(':')
    const resultPlatform = typeof result.platform === 'string' ? result.platform : keyPlatform
    if (resultPlatform !== account.platform) continue

    const resultAccountId = typeof result.accountId === 'string' ? result.accountId : null
    const resultPlatformAccountId = typeof result.platformAccountId === 'string' ? result.platformAccountId : null
    if (resultAccountId && resultAccountId !== account.id) continue
    if (!resultAccountId && keyAccountId && keyAccountId !== account.id) continue
    if (!resultAccountId && !keyAccountId && resultPlatformAccountId && resultPlatformAccountId !== account.platform_account_id) continue

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

function publishingAccountError(account: PublishableAccount): string | null {
  const health = classifySocialPublishingAccountHealth({
    platform: account.platform,
    isActive: true,
    lastError: account.last_error,
    tokenExpiresAt: account.token_expires_at,
    hasRefreshToken: Boolean(account.refresh_token),
    metadata: account.metadata ?? null
  })

  return health.requiresReconnect || health.health === 'reconnect'
    ? 'Publishing account requires reconnect'
    : null
}

function normalizeOptionalText(value: string | null | undefined): string | null {
  const text = value?.trim()
  return text ? text : null
}

async function resolvePublishTarget(account: PublishableAccount): Promise<{
  accountId: string
  accessToken: string
  options: Record<string, unknown>
}> {
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

  let accessToken = account.access_token
  if (account.refresh_token) {
    accessToken = await resolveSocialAccountAccessToken({
      db: { execute },
      account: {
        id: account.id,
        platform: account.platform,
        access_token: account.access_token,
        refresh_token: account.refresh_token,
        token_expires_at: account.token_expires_at ?? null
      }
    })
  }

  return {
    accountId,
    accessToken,
    options: { locationId }
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'publish failed'
}
