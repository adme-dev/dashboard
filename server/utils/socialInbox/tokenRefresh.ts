import type { H3Event } from 'h3'
import {
  getGoogleBusinessOAuthConfig,
  getLinkedInOrganicOAuthConfig,
  getTikTokContentOAuthConfig,
  getYouTubeOAuthConfig
} from '~~/server/utils/socialOAuth/env'
import {
  refreshGoogleBusinessToken,
  type GoogleBusinessTokenResponse
} from '~~/server/utils/socialOAuth/googleBusiness'
import { refreshYouTubeToken } from '~~/server/utils/socialOAuth/youtube'
import { refreshLinkedInOrganicToken } from '~~/server/utils/socialOAuth/linkedin'
import { refreshTikTokContentToken } from '~~/server/utils/socialOAuth/tiktok'

const REFRESH_SKEW_MS = 5 * 60 * 1000
const DEFAULT_GOOGLE_TOKEN_TTL_SECONDS = 3600

export interface SocialInboxTokenAccount {
  id: string
  platform: string
  access_token: string
  refresh_token: string | null
  token_expires_at: string | null
}

interface SocialInboxTokenDb {
  execute(sql: string, params?: unknown[]): Promise<number>
}

interface GoogleBusinessOAuthConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
}

interface TikTokContentOAuthConfig {
  clientKey: string
  clientSecret: string
  redirectUri: string
}

interface RefreshTokenResponse {
  access_token: string
  refresh_token?: string
  expires_in?: number
}

type OAuthRefreshFn = (
  refreshToken: string,
  clientIdOrKey: string,
  clientSecret: string
) => Promise<RefreshTokenResponse>

interface TokenRefreshAdapter {
  label: string
  clientIdOrKey: string
  clientSecret: string
  refresh: OAuthRefreshFn
}

interface SocialInboxTokenDeps {
  now?: () => number
  getGoogleBusinessOAuthConfig?: (event?: H3Event) => GoogleBusinessOAuthConfig
  refreshGoogleBusinessToken?: (
    refreshToken: string,
    clientId: string,
    clientSecret: string
  ) => Promise<GoogleBusinessTokenResponse>
  getYouTubeOAuthConfig?: (event?: H3Event) => GoogleBusinessOAuthConfig
  refreshYouTubeToken?: OAuthRefreshFn
  getLinkedInOrganicOAuthConfig?: (event?: H3Event) => GoogleBusinessOAuthConfig
  refreshLinkedInOrganicToken?: OAuthRefreshFn
  getTikTokContentOAuthConfig?: (event?: H3Event) => TikTokContentOAuthConfig
  refreshTikTokContentToken?: OAuthRefreshFn
}

interface ResolveSocialInboxAccessTokenInput {
  event?: H3Event
  db: SocialInboxTokenDb
  account: SocialInboxTokenAccount
  deps?: SocialInboxTokenDeps
}

function shouldRefreshToken(expiresAt: string | null, nowMs: number) {
  if (!expiresAt) return true
  const expiresAtMs = new Date(expiresAt).getTime()
  if (!Number.isFinite(expiresAtMs)) return true
  return expiresAtMs - nowMs <= REFRESH_SKEW_MS
}

function resolveTokenExpiry(nowMs: number, token: RefreshTokenResponse) {
  return new Date(nowMs + (token.expires_in || DEFAULT_GOOGLE_TOKEN_TTL_SECONDS) * 1000).toISOString()
}

export async function resolveSocialInboxAccessToken({
  event,
  db,
  account,
  deps = {}
}: ResolveSocialInboxAccessTokenInput): Promise<string> {
  return resolveSocialAccountAccessToken({ event, db, account, deps })
}

export async function resolveSocialAccountAccessToken({
  event,
  db,
  account,
  deps = {}
}: ResolveSocialInboxAccessTokenInput): Promise<string> {
  const now = deps.now ?? Date.now
  if (!shouldRefreshToken(account.token_expires_at, now())) {
    return account.access_token
  }

  const adapter = getTokenRefreshAdapter(event, account, deps)
  if (!adapter) {
    return account.access_token
  }

  if (!account.refresh_token) {
    throw new Error(`${adapter.label} token is expired and no refresh token is available. Reconnect the account.`)
  }

  if (!adapter.clientIdOrKey || !adapter.clientSecret) {
    throw new Error(`${adapter.label} OAuth credentials are not configured for token refresh.`)
  }

  let refreshed: RefreshTokenResponse
  try {
    refreshed = await adapter.refresh(account.refresh_token, adapter.clientIdOrKey, adapter.clientSecret)
  } catch (error: unknown) {
    await recordTokenRefreshFailure(db, account.id, `${adapter.label} token refresh failed: ${errorMessage(error)}`.slice(0, 500))
    throw error
  }

  const refreshToken = refreshed.refresh_token || account.refresh_token
  const expiresAt = resolveTokenExpiry(now(), refreshed)

  await db.execute(
    `UPDATE social_accounts
       SET access_token = $2,
           refresh_token = $3,
           token_expires_at = $4,
           last_error = NULL,
           updated_at = NOW()
     WHERE id = $1`,
    [account.id, refreshed.access_token, refreshToken, expiresAt]
  )

  return refreshed.access_token
}

async function recordTokenRefreshFailure(
  db: ResolveSocialInboxAccessTokenInput['db'],
  accountId: string,
  message: string
) {
  try {
    await db.execute(
      `UPDATE social_accounts
          SET last_error = $2,
              updated_at = NOW()
        WHERE id = $1`,
      [accountId, message]
    )
  } catch {
    // Preserve the original provider refresh failure for the caller.
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function getTokenRefreshAdapter(
  event: H3Event | undefined,
  account: SocialInboxTokenAccount,
  deps: SocialInboxTokenDeps
): TokenRefreshAdapter | null {
  switch (account.platform.toLowerCase()) {
    case 'google-business': {
      const config = (deps.getGoogleBusinessOAuthConfig ?? getGoogleBusinessOAuthConfig)(event)
      return {
        label: 'Google Business',
        clientIdOrKey: config.clientId,
        clientSecret: config.clientSecret,
        refresh: deps.refreshGoogleBusinessToken ?? refreshGoogleBusinessToken
      }
    }
    case 'youtube': {
      const config = (deps.getYouTubeOAuthConfig ?? getYouTubeOAuthConfig)(event)
      return {
        label: 'YouTube',
        clientIdOrKey: config.clientId,
        clientSecret: config.clientSecret,
        refresh: deps.refreshYouTubeToken ?? refreshYouTubeToken
      }
    }
    case 'linkedin': {
      const config = (deps.getLinkedInOrganicOAuthConfig ?? getLinkedInOrganicOAuthConfig)(event)
      return {
        label: 'LinkedIn',
        clientIdOrKey: config.clientId,
        clientSecret: config.clientSecret,
        refresh: deps.refreshLinkedInOrganicToken ?? refreshLinkedInOrganicToken
      }
    }
    case 'tiktok': {
      const config = (deps.getTikTokContentOAuthConfig ?? getTikTokContentOAuthConfig)(event)
      return {
        label: 'TikTok',
        clientIdOrKey: config.clientKey,
        clientSecret: config.clientSecret,
        refresh: deps.refreshTikTokContentToken ?? refreshTikTokContentToken
      }
    }
    default:
      return null
  }
}
