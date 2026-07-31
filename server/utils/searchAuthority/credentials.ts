import { queryOne, transaction } from '~~/server/utils/db'
import {
  persistGoogleCredentialRefresh,
  resolveGoogleCredential,
  type GoogleCredentialRow
} from '~~/server/utils/googleCredentialProfiles'
import { refreshGoogleToken, type GoogleTokenResponse } from '~~/server/utils/googleAdsClient'
import { resolveGoogleOAuthRuntimeConfig } from '~~/server/utils/googleOAuthRuntimeConfig'
import { decryptToken, encryptToken } from '~~/server/utils/tokenCrypto'

type BinaryToken = Uint8Array | ArrayBuffer

interface SearchConsoleCredentialRow extends GoogleCredentialRow {
  client_id: string
  google_subject: string
  google_email: string
  scopes: string[]
  status: string
}

interface CredentialTransactionClient {
  query: (
    sql: string,
    params?: unknown[]
  ) => Promise<{ rows: Array<Record<string, unknown>> }>
}

type CredentialTransactionRunner = <T>(
  callback: (db: CredentialTransactionClient) => Promise<T>
) => Promise<T>

export interface StoreSearchConsoleCredentialInput {
  clientId: string
  userId: string
  googleSub: string
  email: string
  tokens: {
    accessToken: string
    refreshToken: string | null
    expiresAt: Date
    scopes: string[]
  }
}

interface StoreSearchConsoleCredentialDependencies {
  encrypt?: typeof encryptToken
  runTransaction?: CredentialTransactionRunner
}

export async function storeSearchConsoleCredentialProfile(
  input: StoreSearchConsoleCredentialInput,
  dependencies: StoreSearchConsoleCredentialDependencies = {}
): Promise<{ connectionId: string, profileId: string }> {
  const encrypt = dependencies.encrypt ?? encryptToken
  const encryptedAccess = await encrypt(input.tokens.accessToken)
  const encryptedRefresh = input.tokens.refreshToken
    ? await encrypt(input.tokens.refreshToken)
    : null
  const runTransaction = dependencies.runTransaction
    ?? transaction as unknown as CredentialTransactionRunner

  return runTransaction(async (db) => {
    const previousResult = await db.query(
      `SELECT
         connection.google_credential_profile_id,
         profile.refresh_token_encrypted,
         profile.refresh_token_iv
       FROM search_console_connections connection
       JOIN google_credential_profiles profile
         ON profile.id = connection.google_credential_profile_id
       WHERE connection.client_id = $1
         AND connection.google_subject = $2
       FOR UPDATE`,
      [input.clientId, input.googleSub]
    )
    const previousCredential = previousResult.rows[0]
    const previousProfileId = previousCredential
      ?.google_credential_profile_id as string | undefined
    const refreshTokenCiphertext = encryptedRefresh?.ciphertext
      ?? previousCredential?.refresh_token_encrypted
      ?? null
    const refreshTokenIv = encryptedRefresh?.iv
      ?? previousCredential?.refresh_token_iv
      ?? null
    if (!refreshTokenCiphertext || !refreshTokenIv) {
      throw new Error('Search Console connection has no offline refresh token')
    }

    const profileResult = await db.query(
      `INSERT INTO google_credential_profiles (
         label, access_token_encrypted, access_token_iv,
         refresh_token_encrypted, refresh_token_iv,
         token_expires_at, scopes, status, metadata, connected_by
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'active', $8, $9)
       RETURNING id`,
      [
        `Search Console · ${input.email}`,
        encryptedAccess.ciphertext,
        encryptedAccess.iv,
        refreshTokenCiphertext,
        refreshTokenIv,
        input.tokens.expiresAt,
        input.tokens.scopes,
        JSON.stringify({
          purpose: 'search_console',
          googleSub: input.googleSub,
          email: input.email
        }),
        input.userId
      ]
    )
    const profileId = profileResult.rows[0]?.id as string | undefined
    if (!profileId) throw new Error('Unable to store Search Console credential profile')

    const connectionResult = await db.query(
      `INSERT INTO search_console_connections (
         client_id, google_credential_profile_id, google_subject,
         google_email, scopes, status, connected_by, connected_at
       )
       VALUES ($1, $2, $3, $4, $5, 'active', $6, NOW())
       ON CONFLICT (client_id, google_subject)
       DO UPDATE SET
         google_credential_profile_id = EXCLUDED.google_credential_profile_id,
         google_email = EXCLUDED.google_email,
         scopes = EXCLUDED.scopes,
         status = 'active',
         connected_by = EXCLUDED.connected_by,
         connected_at = NOW(),
         last_checked_at = NULL,
         last_error_code = NULL,
         last_error_message = NULL,
         updated_at = NOW()
       RETURNING id`,
      [
        input.clientId,
        profileId,
        input.googleSub,
        input.email,
        input.tokens.scopes,
        input.userId
      ]
    )
    const connectionId = connectionResult.rows[0]?.id as string | undefined
    if (!connectionId) throw new Error('Unable to store Search Console connection')

    if (previousProfileId && previousProfileId !== profileId) {
      await db.query(
        `UPDATE google_credential_profiles
         SET status = 'disconnected', updated_at = NOW()
         WHERE id = $1
           AND metadata->>'purpose' = 'search_console'`,
        [previousProfileId]
      )
    }

    return { connectionId, profileId }
  })
}

export interface ResolvedSearchConsoleCredential {
  connectionId: string
  clientId: string
  googleSub: string
  email: string
  scopes: string[]
  accessToken: string
  refreshToken: string | null
  tokenExpiresAt: string | null
  profileId: string
}

interface ResolveSearchConsoleCredentialDependencies {
  loadConnection?: (connectionId: string) => Promise<SearchConsoleCredentialRow | null>
  decrypt?: (ciphertext: BinaryToken, iv: BinaryToken) => Promise<string>
}

export async function resolveSearchConsoleCredential(
  connectionId: string,
  dependencies: ResolveSearchConsoleCredentialDependencies = {}
): Promise<ResolvedSearchConsoleCredential> {
  const loadConnection = dependencies.loadConnection
    ?? ((id: string) => queryOne<SearchConsoleCredentialRow>(
      `SELECT
           connection.id,
           connection.client_id,
           connection.google_subject,
           connection.google_email,
           connection.scopes,
           connection.status,
           NULL::TEXT AS access_token,
           NULL::TEXT AS refresh_token,
           NULL::TIMESTAMPTZ AS token_expires_at,
           connection.google_credential_profile_id,
           profile.access_token_encrypted AS profile_access_token_encrypted,
           profile.access_token_iv AS profile_access_token_iv,
           profile.refresh_token_encrypted AS profile_refresh_token_encrypted,
           profile.refresh_token_iv AS profile_refresh_token_iv,
           profile.token_expires_at AS profile_token_expires_at
         FROM search_console_connections connection
         JOIN google_credential_profiles profile
           ON profile.id = connection.google_credential_profile_id
          AND profile.status = 'active'
          AND profile.metadata->>'purpose' = 'search_console'
         WHERE connection.id = $1
         LIMIT 1`,
      [id]
    ))

  const row = await loadConnection(connectionId)
  if (!row || !['active', 'degraded'].includes(row.status)) {
    throw new Error('Search Console connection is unavailable')
  }

  const resolved = await resolveGoogleCredential(row, {
    decrypt: dependencies.decrypt ?? decryptToken
  })
  if (!resolved.profileId) {
    throw new Error('Search Console connection is not backed by an encrypted profile')
  }

  return {
    connectionId: row.id,
    clientId: row.client_id,
    googleSub: row.google_subject,
    email: row.google_email,
    scopes: row.scopes,
    accessToken: resolved.accessToken,
    refreshToken: resolved.refreshToken,
    tokenExpiresAt: resolved.tokenExpiresAt,
    profileId: resolved.profileId
  }
}

interface RefreshSearchConsoleCredentialDependencies {
  now?: () => Date
  resolveCredential?: (
    connectionId: string
  ) => Promise<ResolvedSearchConsoleCredential>
  resolveConfig?: () => {
    googleClientId: string
    googleClientSecret: string
  }
  refreshToken?: (
    refreshToken: string,
    clientId: string,
    clientSecret: string
  ) => Promise<GoogleTokenResponse>
  persistRefresh?: typeof persistGoogleCredentialRefresh
}

export async function refreshSearchConsoleCredential(
  connectionId: string,
  dependencies: RefreshSearchConsoleCredentialDependencies = {}
): Promise<ResolvedSearchConsoleCredential> {
  const resolveCredential = dependencies.resolveCredential
    ?? resolveSearchConsoleCredential
  const credential = await resolveCredential(connectionId)
  if (!credential.refreshToken) {
    throw new Error('Search Console connection has no offline refresh token')
  }

  const config = dependencies.resolveConfig?.()
    ?? resolveGoogleOAuthRuntimeConfig()
  if (!config.googleClientId || !config.googleClientSecret) {
    throw new Error('Google OAuth credentials are not configured')
  }

  const refresh = dependencies.refreshToken ?? refreshGoogleToken
  const refreshed = await refresh(
    credential.refreshToken,
    config.googleClientId,
    config.googleClientSecret
  )
  const expiresAt = new Date(
    (dependencies.now?.() ?? new Date()).getTime() + refreshed.expires_in * 1000
  )
  const persistRefresh = dependencies.persistRefresh
    ?? persistGoogleCredentialRefresh
  await persistRefresh({
    connectionId,
    profileId: credential.profileId,
    accessToken: refreshed.access_token,
    expiresAt
  })

  return {
    ...credential,
    accessToken: refreshed.access_token,
    tokenExpiresAt: expiresAt.toISOString()
  }
}
