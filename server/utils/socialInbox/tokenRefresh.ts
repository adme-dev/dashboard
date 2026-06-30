import type { H3Event } from 'h3'
import { getGoogleBusinessOAuthConfig } from '~~/server/utils/socialOAuth/env'
import {
  refreshGoogleBusinessToken,
  type GoogleBusinessTokenResponse
} from '~~/server/utils/socialOAuth/googleBusiness'

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

interface SocialInboxTokenDeps {
  now?: () => number
  getGoogleBusinessOAuthConfig?: (event?: H3Event) => GoogleBusinessOAuthConfig
  refreshGoogleBusinessToken?: (
    refreshToken: string,
    clientId: string,
    clientSecret: string
  ) => Promise<GoogleBusinessTokenResponse>
}

interface ResolveSocialInboxAccessTokenInput {
  event?: H3Event
  db: SocialInboxTokenDb
  account: SocialInboxTokenAccount
  deps?: SocialInboxTokenDeps
}

function isGoogleBusinessAccount(account: SocialInboxTokenAccount) {
  return account.platform.toLowerCase() === 'google-business'
}

function shouldRefreshToken(expiresAt: string | null, nowMs: number) {
  if (!expiresAt) return true
  const expiresAtMs = new Date(expiresAt).getTime()
  if (!Number.isFinite(expiresAtMs)) return true
  return expiresAtMs - nowMs <= REFRESH_SKEW_MS
}

function resolveTokenExpiry(nowMs: number, token: GoogleBusinessTokenResponse) {
  return new Date(nowMs + (token.expires_in || DEFAULT_GOOGLE_TOKEN_TTL_SECONDS) * 1000).toISOString()
}

export async function resolveSocialInboxAccessToken({
  event,
  db,
  account,
  deps = {}
}: ResolveSocialInboxAccessTokenInput): Promise<string> {
  const now = deps.now ?? Date.now
  if (!isGoogleBusinessAccount(account) || !shouldRefreshToken(account.token_expires_at, now())) {
    return account.access_token
  }

  if (!account.refresh_token) {
    throw new Error('Google Business token is expired and no refresh token is available. Reconnect the Google Business Profile location.')
  }

  const config = (deps.getGoogleBusinessOAuthConfig ?? getGoogleBusinessOAuthConfig)(event)
  if (!config.clientId || !config.clientSecret) {
    throw new Error('Google Business OAuth credentials are not configured for token refresh.')
  }

  const refresh = deps.refreshGoogleBusinessToken ?? refreshGoogleBusinessToken
  const refreshed = await refresh(account.refresh_token, config.clientId, config.clientSecret)
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
