import { queryOne } from '~~/server/utils/db'
import { decryptToken } from '~~/server/utils/tokenCrypto'

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

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
}

interface CreateAttemptDeps {
  randomState?: () => string
  insertAttempt?: (input: { userId: string; stateDigest: string; expiresAt: Date }) => Promise<{ id: string } | null>
}

export async function createGoogleOAuthAttempt(
  userId: string,
  deps: CreateAttemptDeps = {},
): Promise<{ attemptId: string; state: string }> {
  const state = (deps.randomState || generateState)()
  if (!STATE_PATTERN.test(state)) throw new Error('Generated OAuth state is invalid')

  const stateDigest = await sha256Hex(state)
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
  consumeAttempt?: (input: { userId: string; stateDigest: string }) => Promise<{ id: string } | null>
}

export async function consumeGoogleOAuthAttempt(
  state: string,
  userId: string,
  deps: ConsumeAttemptDeps = {},
): Promise<{ id: string } | null> {
  if (!STATE_PATTERN.test(state)) return null
  const stateDigest = await sha256Hex(state)
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
  deps: ResolveCredentialDeps = {},
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
      source: 'legacy',
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
    source: 'profile',
  }
}
