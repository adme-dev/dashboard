import { execute, queryOne, transaction } from '~~/server/utils/db'
import { decryptToken, encryptToken } from '~~/server/utils/tokenCrypto'

const OAUTH_ATTEMPT_TTL_MS = 10 * 60 * 1000
const STATE_PATTERN = /^[A-Za-z0-9_-]{32,128}$/

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function generateState(): string {
  return bytesToBase64Url(crypto.getRandomValues(new Uint8Array(32)))
}

export async function hashGoogleOAuthState(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
}

interface CreateAttemptDeps {
  randomState?: () => string
  insertAttempt?: (input: { userId: string, stateDigest: string, expiresAt: Date }) => Promise<{ id: string } | null>
}

export async function createGoogleOAuthAttempt(
  userId: string,
  deps: CreateAttemptDeps = {}
): Promise<{ attemptId: string, state: string }> {
  const state = (deps.randomState || generateState)()
  if (!STATE_PATTERN.test(state)) throw new Error('Generated OAuth state is invalid')

  const stateDigest = await hashGoogleOAuthState(state)
  const expiresAt = new Date(Date.now() + OAUTH_ATTEMPT_TTL_MS)
  const insertAttempt = deps.insertAttempt || (async input => queryOne<{ id: string }>(
    `INSERT INTO google_oauth_attempts (state_digest, initiated_by, expires_at)
     VALUES ($1, $2, $3)
     RETURNING id`,
    [input.stateDigest, input.userId, input.expiresAt]
  ))
  const attempt = await insertAttempt({ userId, stateDigest, expiresAt })
  if (!attempt) throw new Error('Unable to create Google OAuth attempt')
  return { attemptId: attempt.id, state }
}

interface ConsumeAttemptDeps {
  consumeAttempt?: (input: { userId: string, stateDigest: string }) => Promise<{ id: string } | null>
}

export async function consumeGoogleOAuthAttempt(
  state: string,
  userId: string,
  deps: ConsumeAttemptDeps = {}
): Promise<{ id: string } | null> {
  if (!STATE_PATTERN.test(state)) return null
  const stateDigest = await hashGoogleOAuthState(state)
  const consumeAttempt = deps.consumeAttempt || (async input => queryOne<{ id: string }>(
    `UPDATE google_oauth_attempts
     SET consumed_at = NOW()
     WHERE state_digest = $1
       AND initiated_by = $2
       AND consumed_at IS NULL
       AND expires_at > NOW()
     RETURNING id`,
    [input.stateDigest, input.userId]
  ))
  return consumeAttempt({ userId, stateDigest })
}

type BinaryToken = Uint8Array | ArrayBuffer

export interface GoogleCredentialRow {
  id: string
  access_token: string | null
  refresh_token: string | null
  token_expires_at: string | null
  google_credential_profile_id?: string | null
  profile_access_token_encrypted?: BinaryToken | null
  profile_access_token_iv?: BinaryToken | null
  profile_refresh_token_encrypted?: BinaryToken | null
  profile_refresh_token_iv?: BinaryToken | null
  profile_token_expires_at?: string | null
}

export const GOOGLE_CREDENTIAL_PROFILE_SELECT = `
  sc.google_credential_profile_id,
  gcp.access_token_encrypted AS profile_access_token_encrypted,
  gcp.access_token_iv AS profile_access_token_iv,
  gcp.refresh_token_encrypted AS profile_refresh_token_encrypted,
  gcp.refresh_token_iv AS profile_refresh_token_iv,
  gcp.token_expires_at AS profile_token_expires_at
`

export const GOOGLE_CREDENTIAL_PROFILE_JOIN = `
  LEFT JOIN google_credential_profiles gcp
    ON gcp.id = sc.google_credential_profile_id
   AND gcp.status = 'active'
`

interface ResolveCredentialDeps {
  decrypt?: (ciphertext: BinaryToken, iv: BinaryToken) => Promise<string>
}

export async function resolveGoogleCredential(
  row: GoogleCredentialRow,
  deps: ResolveCredentialDeps = {}
): Promise<{
  accessToken: string
  refreshToken: string | null
  tokenExpiresAt: string | null
  profileId: string | null
  source: 'profile' | 'legacy'
}> {
  if (!row.google_credential_profile_id) {
    if (!row.access_token) throw new Error('Google connection has no usable credential')
    return {
      accessToken: row.access_token,
      refreshToken: row.refresh_token,
      tokenExpiresAt: row.token_expires_at,
      profileId: null,
      source: 'legacy'
    }
  }

  if (!row.profile_access_token_encrypted || !row.profile_access_token_iv) {
    throw new Error('Google credential profile is incomplete')
  }

  const decrypt = deps.decrypt || decryptToken
  const accessToken = await decrypt(row.profile_access_token_encrypted, row.profile_access_token_iv)
  let refreshToken: string | null = null
  if (row.profile_refresh_token_encrypted || row.profile_refresh_token_iv) {
    if (!row.profile_refresh_token_encrypted || !row.profile_refresh_token_iv) {
      throw new Error('Google credential profile is incomplete')
    }
    refreshToken = await decrypt(row.profile_refresh_token_encrypted, row.profile_refresh_token_iv)
  }

  return {
    accessToken,
    refreshToken,
    tokenExpiresAt: row.profile_token_expires_at || null,
    profileId: row.google_credential_profile_id,
    source: 'profile'
  }
}

interface PersistGoogleCredentialRefreshInput {
  connectionId: string
  profileId: string | null
  accessToken: string
  expiresAt: Date
}

interface PersistGoogleCredentialRefreshDeps {
  encrypt?: typeof encryptToken
  updateProfile?: (input: {
    profileId: string
    ciphertext: Uint8Array
    iv: Uint8Array
    expiresAt: Date
  }) => Promise<unknown>
  updateLegacy?: (input: {
    connectionId: string
    accessToken: string
    expiresAt: Date
  }) => Promise<unknown>
}

export async function persistGoogleCredentialRefresh(
  input: PersistGoogleCredentialRefreshInput,
  deps: PersistGoogleCredentialRefreshDeps = {}
): Promise<void> {
  if (input.profileId) {
    const encrypt = deps.encrypt || encryptToken
    const encrypted = await encrypt(input.accessToken)
    const updateProfile = deps.updateProfile || (async value => execute(
      `UPDATE google_credential_profiles
       SET access_token_encrypted = $1,
           access_token_iv = $2,
           token_expires_at = $3,
           status = 'active',
           updated_at = NOW()
       WHERE id = $4`,
      [value.ciphertext, value.iv, value.expiresAt, value.profileId]
    ))
    await updateProfile({
      profileId: input.profileId,
      ciphertext: encrypted.ciphertext,
      iv: encrypted.iv,
      expiresAt: input.expiresAt
    })
    return
  }

  const updateLegacy = deps.updateLegacy || (async value => execute(
    `UPDATE social_connections
     SET access_token = $1, token_expires_at = $2, updated_at = NOW()
     WHERE id = $3`,
    [value.accessToken, value.expiresAt, value.connectionId]
  ))
  await updateLegacy(input)
}

export interface GoogleDiscoveredAccount {
  customerId: string
  name: string
  currencyCode: string
  descriptiveName?: string | null
  managerCustomerId: string | null
}

interface StoreGoogleCredentialProfileInput {
  userId: string
  tokens: {
    accessToken: string
    refreshToken: string | null
    expiresAt: Date
    scopes: string[]
  }
  accessibleCustomerIds: string[]
  accounts: GoogleDiscoveredAccount[]
}

interface StoreGoogleCredentialProfileDeps {
  encrypt?: typeof encryptToken
  runTransaction?: GoogleProfileTransactionRunner
}

interface GoogleProfileTransactionClient {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }>
}

type GoogleProfileTransactionRunner = <T>(
  callback: (db: GoogleProfileTransactionClient) => Promise<T>
) => Promise<T>

function formatCustomerId(customerId: string): string {
  const digits = customerId.replace(/\D/g, '')
  return digits.length === 10
    ? `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`
    : customerId
}

function profileLabel(managerIds: string[]): string {
  if (managerIds.length === 1) return `Google Ads manager ${formatCustomerId(managerIds[0]!)}`
  if (managerIds.length > 1) return `Google Ads · ${managerIds.length} managers`
  return 'Google Ads direct connection'
}

export async function storeGoogleCredentialProfile(
  input: StoreGoogleCredentialProfileInput,
  deps: StoreGoogleCredentialProfileDeps = {}
): Promise<{ profileId: string, storedCount: number }> {
  const encrypt = deps.encrypt || encryptToken
  const encryptedAccess = await encrypt(input.tokens.accessToken)
  const encryptedRefresh = input.tokens.refreshToken
    ? await encrypt(input.tokens.refreshToken)
    : null
  const managerIds = Array.from(new Set(
    input.accounts.map(account => account.managerCustomerId).filter((id): id is string => Boolean(id))
  ))
  const runTransaction = deps.runTransaction || transaction as unknown as GoogleProfileTransactionRunner

  return runTransaction(async (db) => {
    const profileResult = await db.query(
      `INSERT INTO google_credential_profiles (
         label, access_token_encrypted, access_token_iv,
         refresh_token_encrypted, refresh_token_iv,
         token_expires_at, scopes, status, metadata, connected_by
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'active', $8, $9)
       RETURNING id`,
      [
        profileLabel(managerIds),
        encryptedAccess.ciphertext,
        encryptedAccess.iv,
        encryptedRefresh?.ciphertext || null,
        encryptedRefresh?.iv || null,
        input.tokens.expiresAt,
        input.tokens.scopes,
        JSON.stringify({
          accessibleCustomerIds: input.accessibleCustomerIds,
          managerCustomerIds: managerIds
        }),
        input.userId
      ]
    )
    const profileId = profileResult.rows[0]?.id as string | undefined
    if (!profileId) throw new Error('Unable to store Google credential profile')

    let storedCount = 0
    for (const account of input.accounts) {
      const connectionResult = await db.query(
        `INSERT INTO social_connections (
           platform, account_id, account_name, access_token, refresh_token,
           token_expires_at, scopes, status, metadata, connected_by,
           google_credential_profile_id
         )
         VALUES ('google', $1, $2, NULL, NULL, $3, $4, 'active', $5, $6, $7)
         ON CONFLICT (platform, account_id)
         DO UPDATE SET
           account_name = EXCLUDED.account_name,
           token_expires_at = EXCLUDED.token_expires_at,
           scopes = EXCLUDED.scopes,
           status = 'active',
           metadata = COALESCE(social_connections.metadata, '{}'::jsonb) || EXCLUDED.metadata,
           connected_by = EXCLUDED.connected_by,
           google_credential_profile_id = EXCLUDED.google_credential_profile_id,
           updated_at = NOW()
         RETURNING id`,
        [
          account.customerId,
          account.name,
          input.tokens.expiresAt,
          input.tokens.scopes,
          JSON.stringify({
            currencyCode: account.currencyCode,
            descriptiveName: account.descriptiveName || null,
            managerCustomerId: account.managerCustomerId
          }),
          input.userId,
          profileId
        ]
      )
      const connectionId = connectionResult.rows[0]?.id as string | undefined
      if (!connectionId) throw new Error('Unable to link Google Ads account')

      await db.query(
        `INSERT INTO google_credential_profile_accounts (
           profile_id, connection_id, manager_customer_id
         )
         VALUES ($1, $2, $3)
         ON CONFLICT (profile_id, connection_id)
         DO UPDATE SET
           manager_customer_id = EXCLUDED.manager_customer_id,
           discovered_at = NOW()`,
        [profileId, connectionId, account.managerCustomerId]
      )
      storedCount++
    }

    return { profileId, storedCount }
  })
}
