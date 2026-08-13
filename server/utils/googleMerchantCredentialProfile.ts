import { queryOne as defaultQueryOne } from '~~/server/utils/db'
import {
  persistGoogleCredentialRefresh,
  resolveGoogleCredential,
  type GoogleCredentialRow
} from '~~/server/utils/googleCredentialProfiles'
import { refreshGoogleToken } from '~~/server/utils/googleAdsClient'
import { resolveGoogleAdsRuntimeConfig } from '~~/server/utils/spendSync'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const ACCOUNT_ID = /^\d{6,20}$/
const CONTENT_SCOPE = 'https://www.googleapis.com/auth/content'

interface ProfileRow {
  id: string
  status: string
  scopes: string[]
  metadata: Record<string, unknown>
  access_token_encrypted: Uint8Array | ArrayBuffer
  access_token_iv: Uint8Array | ArrayBuffer
  refresh_token_encrypted: Uint8Array | ArrayBuffer | null
  refresh_token_iv: Uint8Array | ArrayBuffer | null
  token_expires_at: string | null
}

interface Dependencies {
  queryOne?: <T = unknown>(sql: string, params?: unknown[]) => Promise<T | null>
  resolveCredential?: typeof resolveGoogleCredential
  getRuntimeConfig?: () => { googleClientId: string, googleClientSecret: string }
  refreshToken?: typeof refreshGoogleToken
  persistRefresh?: typeof persistGoogleCredentialRefresh
}

export class GoogleMerchantCredentialProfileError extends Error {
  constructor(public readonly code:
    | 'MERCHANT_CREDENTIAL_PROFILE_NOT_FOUND'
    | 'MERCHANT_CREDENTIAL_PROFILE_SCOPE_MISMATCH'
    | 'MERCHANT_CREDENTIAL_PROFILE_RUNTIME_NOT_CONFIGURED'
    | 'MERCHANT_CREDENTIAL_PROFILE_UNAVAILABLE') {
    super(code)
    this.name = 'GoogleMerchantCredentialProfileError'
  }
}

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

export async function loadGoogleMerchantCredentialProfile(input: {
  profileId: string
  merchantAccountId: string
  developerEmail: string
  forceTokenRefresh?: boolean
}, dependencies: Dependencies = {}) {
  if (
    !UUID.test(input.profileId)
    || !ACCOUNT_ID.test(input.merchantAccountId)
    || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.developerEmail)
  ) throw new GoogleMerchantCredentialProfileError('MERCHANT_CREDENTIAL_PROFILE_SCOPE_MISMATCH')

  const queryOne = dependencies.queryOne || defaultQueryOne
  const row = await queryOne<ProfileRow>(`
    SELECT id, status, scopes, metadata,
           access_token_encrypted, access_token_iv,
           refresh_token_encrypted, refresh_token_iv, token_expires_at
      FROM google_credential_profiles
     WHERE id = $1::uuid AND status = 'active'
     LIMIT 1
  `, [input.profileId])
  if (!row) throw new GoogleMerchantCredentialProfileError('MERCHANT_CREDENTIAL_PROFILE_NOT_FOUND')

  const metadata = object(row.metadata)
  const accountIds = Array.isArray(metadata?.merchantCenterIds)
    ? metadata.merchantCenterIds.map(String)
    : []
  const registrationAccountId = text(metadata?.merchantParentId)
  const verifiedEmail = text(metadata?.googleAccountEmail || metadata?.googleEmail).toLowerCase()
  if (
    row.id.toLowerCase() !== input.profileId.toLowerCase()
    || row.status !== 'active'
    || !row.scopes.includes(CONTENT_SCOPE)
    || metadata?.purpose !== 'merchant'
    || verifiedEmail !== input.developerEmail.toLowerCase()
    || !ACCOUNT_ID.test(registrationAccountId)
    || !accountIds.includes(input.merchantAccountId)
  ) throw new GoogleMerchantCredentialProfileError('MERCHANT_CREDENTIAL_PROFILE_SCOPE_MISMATCH')

  let credential
  try {
    credential = await (dependencies.resolveCredential || resolveGoogleCredential)({
      id: row.id,
      access_token: null,
      refresh_token: null,
      token_expires_at: null,
      google_credential_profile_id: row.id,
      profile_access_token_encrypted: row.access_token_encrypted,
      profile_access_token_iv: row.access_token_iv,
      profile_refresh_token_encrypted: row.refresh_token_encrypted,
      profile_refresh_token_iv: row.refresh_token_iv,
      profile_token_expires_at: row.token_expires_at
    } satisfies GoogleCredentialRow)
  } catch {
    throw new GoogleMerchantCredentialProfileError('MERCHANT_CREDENTIAL_PROFILE_UNAVAILABLE')
  }

  const expiresSoon = !credential.tokenExpiresAt
    || new Date(credential.tokenExpiresAt).getTime() < Date.now() + 5 * 60 * 1000
  if (!input.forceTokenRefresh && !expiresSoon) {
    return { profileId: row.id, accessToken: credential.accessToken, registrationAccountId }
  }
  if (!credential.refreshToken) {
    throw new GoogleMerchantCredentialProfileError('MERCHANT_CREDENTIAL_PROFILE_UNAVAILABLE')
  }

  const runtime = (dependencies.getRuntimeConfig || (() => resolveGoogleAdsRuntimeConfig()))()
  if (!runtime.googleClientId || !runtime.googleClientSecret) {
    throw new GoogleMerchantCredentialProfileError('MERCHANT_CREDENTIAL_PROFILE_RUNTIME_NOT_CONFIGURED')
  }
  try {
    const refreshed = await (dependencies.refreshToken || refreshGoogleToken)(
      credential.refreshToken,
      runtime.googleClientId,
      runtime.googleClientSecret
    )
    const expiresAt = new Date(Date.now() + refreshed.expires_in * 1000)
    await (dependencies.persistRefresh || persistGoogleCredentialRefresh)({
      connectionId: row.id,
      profileId: row.id,
      accessToken: refreshed.access_token,
      expiresAt
    })
    return { profileId: row.id, accessToken: refreshed.access_token, registrationAccountId }
  } catch (error) {
    if (error instanceof GoogleMerchantCredentialProfileError) throw error
    throw new GoogleMerchantCredentialProfileError('MERCHANT_CREDENTIAL_PROFILE_UNAVAILABLE')
  }
}
