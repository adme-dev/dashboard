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
import { refreshGoogleBusinessToken } from '~~/server/utils/socialOAuth/googleBusiness'
import { getGoogleBusinessOAuthConfig } from '~~/server/utils/socialOAuth/env'

/** Classify a media URL as video or image for provider dispatch. Render links + .mp4/.mov → video. */
export function mediaTypeForUrl(url: string): 'video' | 'image' {
  const u = url.toLowerCase()
  if (/\.(mp4|mov|webm|m4v)(\?|$)/.test(u) || u.includes('/api/public/renders/')) return 'video'
  return 'image'
}

export interface BaseContent {
  content: string
  mediaUrls: string[]
}

export interface PlatformOverride {
  content?: string
  mediaUrls?: string[]
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
  metadata?: Record<string, unknown> | null
}

export interface PublishablePost {
  id: string
  content: string
  media_urls: string[] | null
  link_url: string | null
  platforms: string[]
  platform_overrides: Record<string, PlatformOverride>
  accounts: PublishableAccount[]
}

export interface PublishOutcome {
  status: 'published' | 'partially_published' | 'failed'
  platformResults: Record<string, {
    status: string
    platformPostId?: string
    url?: string
    error?: string | null
  }>
}

/** Publish a post across every platform it targets, aggregating per-network results. */
export async function publishPost(post: PublishablePost): Promise<PublishOutcome> {
  const base: BaseContent = { content: post.content, mediaUrls: post.media_urls ?? [] }
  const results: PublishOutcome['platformResults'] = {}
  let ok = 0
  let fail = 0

  for (const platform of post.platforms) {
    const account = post.accounts.find(a => a.platform === platform)
    if (!account) {
      results[platform] = { status: 'failed', error: 'No connected account' }
      fail++
      continue
    }
    const resolved = resolvePlatformContent(base, post.platform_overrides ?? {}, platform)
    const link = stampUtms(post.link_url, platform, post.id)
    const content = link ? `${resolved.content}\n${link}` : resolved.content
    try {
      const provider = getProviderOrThrow(platform)
      const target = await resolvePublishTarget(account)
      const r = await provider.post({
        accountId: target.accountId,
        accessToken: target.accessToken,
        content,
        media: resolved.mediaUrls.map(url => ({ url, type: mediaTypeForUrl(url) })),
        options: target.options
      })
      results[platform] = {
        status: r.status,
        platformPostId: r.platformPostId,
        url: r.url,
        error: r.error ?? null
      }
      if (r.status === 'success') ok++
      else fail++
    } catch (e: unknown) {
      results[platform] = { status: 'failed', error: errorMessage(e) }
      fail++
    }
  }

  const status: PublishOutcome['status'] = fail === 0 ? 'published' : ok === 0 ? 'failed' : 'partially_published'
  return { status, platformResults: results }
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
  if (account.refresh_token && isExpiringSoon(account.token_expires_at)) {
    const googleConfig = getGoogleBusinessOAuthConfig()
    const refreshed = await refreshGoogleBusinessToken(
      account.refresh_token,
      googleConfig.clientId,
      googleConfig.clientSecret
    )
    accessToken = refreshed.access_token
    const expiresAt = new Date(Date.now() + (refreshed.expires_in || 3600) * 1000).toISOString()
    await execute(
      `UPDATE social_accounts
          SET access_token = $1,
              refresh_token = COALESCE($2, refresh_token),
              token_expires_at = $3,
              updated_at = NOW()
        WHERE id = $4`,
      [accessToken, refreshed.refresh_token || null, expiresAt, account.id]
    )
  }

  return {
    accountId,
    accessToken,
    options: { locationId }
  }
}

function isExpiringSoon(expiresAt: string | null | undefined): boolean {
  if (!expiresAt) return true
  return new Date(expiresAt).getTime() <= Date.now() + 5 * 60_000
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'publish failed'
}
