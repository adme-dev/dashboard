import { ofetch } from 'ofetch'
import type { AccountRow } from './store'

const TIKTOK_AUTH_URL = 'https://www.tiktok.com/v2/auth/authorize/'
const TIKTOK_TOKEN_URL = 'https://open.tiktokapis.com/v2/oauth/token/'
const TIKTOK_API_BASE = 'https://open.tiktokapis.com/v2'

export const TIKTOK_CONTENT_OAUTH_SCOPES = [
  'user.info.basic',
  'user.info.profile',
  'video.publish',
  'video.upload'
]

export interface TikTokContentTokenResponse {
  access_token: string
  expires_in: number
  open_id?: string
  refresh_token?: string
  refresh_expires_in?: number
  scope?: string
  token_type?: string
}

interface TikTokUserInfoResponse {
  data?: {
    user?: {
      open_id?: string
      display_name?: string
      username?: string
      avatar_url?: string
      profile_deep_link?: string
      is_verified?: boolean
    }
  }
  error?: {
    code?: string
    message?: string
    log_id?: string
  }
}

export interface TikTokCreatorSelection {
  openId: string
  displayName: string
  username: string | null
  avatarUrl: string | null
  profileDeepLink: string | null
  isVerified: boolean
}

export function buildTikTokContentAuthUrl(clientKey: string, redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_key: clientKey,
    redirect_uri: redirectUri,
    state,
    scope: TIKTOK_CONTENT_OAUTH_SCOPES.join(','),
    response_type: 'code'
  })
  return `${TIKTOK_AUTH_URL}?${params.toString()}`
}

export async function exchangeTikTokContentCode(
  code: string,
  clientKey: string,
  clientSecret: string,
  redirectUri: string
): Promise<TikTokContentTokenResponse> {
  const body = new URLSearchParams({
    client_key: clientKey,
    client_secret: clientSecret,
    code,
    grant_type: 'authorization_code',
    redirect_uri: redirectUri
  })
  return ofetch<TikTokContentTokenResponse>(TIKTOK_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  })
}

export async function refreshTikTokContentToken(
  refreshToken: string,
  clientKey: string,
  clientSecret: string
): Promise<TikTokContentTokenResponse> {
  const body = new URLSearchParams({
    client_key: clientKey,
    client_secret: clientSecret,
    grant_type: 'refresh_token',
    refresh_token: refreshToken
  })
  return ofetch<TikTokContentTokenResponse>(TIKTOK_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  })
}

export async function discoverTikTokCreator(accessToken: string): Promise<TikTokCreatorSelection> {
  const url = new URL(`${TIKTOK_API_BASE}/user/info/`)
  url.searchParams.set('fields', 'open_id,display_name,username,avatar_url,profile_deep_link,is_verified')
  const data = await tiktokFetch<TikTokUserInfoResponse>(url.toString(), accessToken)
  const user = data.data?.user
  if (!user?.open_id) {
    throw new Error(data.error?.message || 'TikTok creator info response did not include open_id')
  }
  return {
    openId: user.open_id,
    displayName: textOrNull(user.display_name) || textOrNull(user.username) || `TikTok creator ${user.open_id}`,
    username: textOrNull(user.username),
    avatarUrl: textOrNull(user.avatar_url),
    profileDeepLink: textOrNull(user.profile_deep_link),
    isVerified: user.is_verified === true
  }
}

export function getTikTokContentDiscoveryErrorReason(error: unknown): string {
  const raw = error as {
    status?: number
    statusCode?: number
    data?: {
      error?: {
        code?: string
        message?: string
      }
    }
    message?: string
  }
  const code = raw.data?.error?.code || ''
  const message = raw.data?.error?.message || raw.message || ''
  const haystack = `${code} ${message}`.toLowerCase()

  if (haystack.includes('scope')) return 'tiktok_invalid_scope'
  if (raw.statusCode === 401 || raw.status === 401) return 'tiktok_token_invalid'
  return 'tiktok_creator_info_failed'
}

export function mapTikTokCreatorToAccountRow(
  creator: TikTokCreatorSelection,
  accessToken: string,
  refreshToken: string | null,
  expiresAt: string | null
): AccountRow {
  return {
    platform: 'tiktok',
    platform_account_id: creator.openId,
    account_name: creator.displayName,
    access_token: accessToken,
    refresh_token: refreshToken,
    token_expires_at: expiresAt,
    metadata: {
      tiktokOpenId: creator.openId,
      tiktokUsername: creator.username,
      avatarUrl: creator.avatarUrl,
      profileDeepLink: creator.profileDeepLink,
      isVerified: creator.isVerified,
      publishingReadiness: 'oauth_connected_publish_not_enabled'
    }
  }
}

async function tiktokFetch<T>(url: string, accessToken: string): Promise<T> {
  try {
    return await ofetch<T>(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    })
  } catch (error) {
    console.warn('[TikTokContentOAuth] API request failed', getTikTokApiErrorLog(url, error))
    throw error
  }
}

function getTikTokApiErrorLog(url: string, error: unknown): Record<string, unknown> {
  const raw = error as {
    status?: number
    statusCode?: number
    data?: {
      error?: {
        code?: string
        message?: string
        log_id?: string
      }
    }
    message?: string
  }
  const parsedUrl = new URL(url)
  return {
    endpoint: `${parsedUrl.hostname}${parsedUrl.pathname}`,
    statusCode: raw.statusCode || raw.status || null,
    tiktokCode: raw.data?.error?.code || null,
    logId: raw.data?.error?.log_id || null,
    message: raw.data?.error?.message || raw.message || 'TikTok API request failed'
  }
}

function textOrNull(value: string | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed || null
}
