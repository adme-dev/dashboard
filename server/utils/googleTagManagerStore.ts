import { createError, type H3Event } from 'h3'
import { execute, queryOne, queryRows, transaction } from '~~/server/utils/db'
import { decryptToken, encryptToken } from '~~/server/utils/tokenCrypto'
import { hashGoogleOAuthState } from '~~/server/utils/googleCredentialProfiles'
import { refreshGoogleToken } from '~~/server/utils/googleAdsClient'
import { resolveGtmOAuthRuntimeConfig } from '~~/server/utils/googleTagManagerOAuthRuntimeConfig'
import { GTM_OAUTH_SCOPES } from '~~/server/utils/googleTagManagerClient'

const OAUTH_TTL_MS = 10 * 60 * 1000
const QUOTA_WINDOW_SECONDS = 100
// Google permits 25 requests per 100 seconds. Keep five calls in reserve for
// an operator recovering or rolling back a partially-completed operation.
const QUOTA_WINDOW_BUDGET = 20

type BinaryToken = Uint8Array | ArrayBuffer

interface GtmCredentialRow {
  connection_id: string
  profile_id: string
  google_subject: string
  google_email: string
  connection_status: string
  access_token_encrypted: BinaryToken
  access_token_iv: BinaryToken
  refresh_token_encrypted: BinaryToken | null
  refresh_token_iv: BinaryToken | null
  token_expires_at: string | null
  scopes: string[]
}

export interface GtmConnectionSummary {
  id: string
  googleEmail: string
  status: string
  scopes: string[]
  lastDiscoveredAt: string | null
  createdAt: string
}

export async function createGtmOAuthAttempt(userId: string): Promise<string> {
  const state = crypto.randomUUID()
  const digest = await hashGoogleOAuthState(state)
  const expiresAt = new Date(Date.now() + OAUTH_TTL_MS)
  await execute(
    `INSERT INTO gtm_oauth_attempts (state_digest, initiated_by, expires_at)
     VALUES ($1, $2, $3)`,
    [digest, userId, expiresAt],
  )
  return state
}

export async function consumeGtmOAuthAttempt(state: string, userId: string): Promise<boolean> {
  if (!/^[a-zA-Z0-9_-]{32,128}$/.test(state)) return false
  const digest = await hashGoogleOAuthState(state)
  const row = await queryOne<{ id: string }>(
    `UPDATE gtm_oauth_attempts
        SET consumed_at = NOW()
      WHERE state_digest = $1
        AND initiated_by = $2
        AND consumed_at IS NULL
        AND expires_at > NOW()
      RETURNING id`,
    [digest, userId],
  )
  return Boolean(row)
}

export function getGtmAuthUrl(input: {
  clientId: string
  redirectUri: string
  state: string
}): string {
  const params = new URLSearchParams({
    client_id: input.clientId,
    redirect_uri: input.redirectUri,
    state: input.state,
    scope: GTM_OAUTH_SCOPES.join(' '),
    response_type: 'code',
    access_type: 'offline',
    include_granted_scopes: 'false',
    prompt: 'consent select_account',
  })
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
}

export async function storeGtmConnection(input: {
  userId: string
  identity: { sub: string, email: string }
  accessToken: string
  refreshToken: string | null
  expiresAt: Date
  scopes: string[]
  accounts: Array<{ path: string, name: string }>
}): Promise<{ connectionId: string }> {
  const missing = GTM_OAUTH_SCOPES
    .filter(scope => scope.startsWith('https://'))
    .filter(scope => !input.scopes.includes(scope))
  if (missing.length) {
    throw createError({
      statusCode: 403,
      statusMessage: `Google did not grant the required Tag Manager permissions: ${missing.join(', ')}`,
    })
  }

  const encryptedAccess = await encryptToken(input.accessToken)
  const encryptedRefresh = input.refreshToken ? await encryptToken(input.refreshToken) : null

  return transaction(async (db) => {
    const existing = await db.query(
      `SELECT google_credential_profile_id
         FROM gtm_connections
        WHERE google_subject = $1
        FOR UPDATE`,
      [input.identity.sub],
    )
    const oldProfileId = existing.rows[0]?.google_credential_profile_id as string | undefined

    const profileResult = await db.query(
      `INSERT INTO google_credential_profiles (
         label, access_token_encrypted, access_token_iv,
         refresh_token_encrypted, refresh_token_iv,
         token_expires_at, scopes, status, metadata, connected_by
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7,'active',$8,$9)
       RETURNING id`,
      [
        `Google Tag Manager · ${input.identity.email}`.slice(0, 120),
        encryptedAccess.ciphertext,
        encryptedAccess.iv,
        encryptedRefresh?.ciphertext || null,
        encryptedRefresh?.iv || null,
        input.expiresAt,
        input.scopes,
        JSON.stringify({
          service: 'google_tag_manager',
          googleSubject: input.identity.sub,
          googleEmail: input.identity.email,
          accessibleAccounts: input.accounts,
        }),
        input.userId,
      ],
    )
    const profileId = String(profileResult.rows[0]?.id || '')
    if (!profileId) throw new Error('Unable to store Google Tag Manager credential profile')

    const connectionResult = await db.query(
      `INSERT INTO gtm_connections (
         google_credential_profile_id, google_subject, google_email,
         status, metadata, connected_by, last_discovered_at
       )
       VALUES ($1,$2,$3,'active',$4,$5,NOW())
       ON CONFLICT (google_subject)
       DO UPDATE SET
         google_credential_profile_id = EXCLUDED.google_credential_profile_id,
         google_email = EXCLUDED.google_email,
         status = 'active',
         metadata = EXCLUDED.metadata,
         connected_by = EXCLUDED.connected_by,
         last_discovered_at = NOW(),
         updated_at = NOW()
       RETURNING id`,
      [profileId, input.identity.sub, input.identity.email, JSON.stringify({ accessibleAccounts: input.accounts }), input.userId],
    )
    const connectionId = String(connectionResult.rows[0]?.id || '')
    if (!connectionId) throw new Error('Unable to store Google Tag Manager connection')

    if (oldProfileId && oldProfileId !== profileId) {
      await db.query(
        `UPDATE google_credential_profiles
            SET status = 'disconnected', updated_at = NOW()
          WHERE id = $1`,
        [oldProfileId],
      )
    }

    return { connectionId }
  })
}

async function loadCredential(connectionId: string): Promise<GtmCredentialRow | null> {
  return queryOne<GtmCredentialRow>(
    `SELECT gc.id AS connection_id,
            gc.google_subject,
            gc.google_email,
            gc.status AS connection_status,
            gcp.id AS profile_id,
            gcp.access_token_encrypted,
            gcp.access_token_iv,
            gcp.refresh_token_encrypted,
            gcp.refresh_token_iv,
            gcp.token_expires_at,
            gcp.scopes
       FROM gtm_connections gc
       JOIN google_credential_profiles gcp
         ON gcp.id = gc.google_credential_profile_id
      WHERE gc.id = $1
        AND gc.status = 'active'
        AND gcp.status = 'active'`,
    [connectionId],
  )
}

export async function resolveGtmAccessToken(event: H3Event, connectionId: string): Promise<{
  token: string
  scopes: string[]
  googleEmail: string
}> {
  const row = await loadCredential(connectionId)
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Active Google Tag Manager connection not found' })

  let token = await decryptToken(row.access_token_encrypted, row.access_token_iv)
  const expiresSoon = !row.token_expires_at
    || new Date(row.token_expires_at).getTime() < Date.now() + 5 * 60 * 1000

  if (expiresSoon) {
    if (!row.refresh_token_encrypted || !row.refresh_token_iv) {
      await execute(
        `UPDATE gtm_connections SET status = 'expired', updated_at = NOW() WHERE id = $1`,
        [connectionId],
      )
      throw createError({ statusCode: 401, statusMessage: 'Google Tag Manager connection expired; reconnect it' })
    }
    const refreshToken = await decryptToken(row.refresh_token_encrypted, row.refresh_token_iv)
    const config = resolveGtmOAuthRuntimeConfig(event)
    if (!config.googleClientId || !config.googleClientSecret) {
      throw createError({ statusCode: 500, statusMessage: 'Google Tag Manager OAuth credentials are not configured' })
    }
    const refreshed = await refreshGoogleToken(refreshToken, config.googleClientId, config.googleClientSecret)
    token = refreshed.access_token
    const encrypted = await encryptToken(token)
    await execute(
      `UPDATE google_credential_profiles
          SET access_token_encrypted = $1,
              access_token_iv = $2,
              token_expires_at = $3,
              updated_at = NOW()
        WHERE id = $4`,
      [encrypted.ciphertext, encrypted.iv, new Date(Date.now() + refreshed.expires_in * 1000), row.profile_id],
    )
  }

  return { token, scopes: row.scopes || [], googleEmail: row.google_email }
}

export async function listGtmConnections(): Promise<GtmConnectionSummary[]> {
  const rows = await queryRows<{
    id: string
    google_email: string
    status: string
    scopes: string[]
    last_discovered_at: string | null
    created_at: string
  }>(
    `SELECT gc.id, gc.google_email, gc.status, gcp.scopes,
            gc.last_discovered_at, gc.created_at
       FROM gtm_connections gc
       JOIN google_credential_profiles gcp ON gcp.id = gc.google_credential_profile_id
      WHERE gc.status <> 'disconnected'
      ORDER BY gc.updated_at DESC`,
  )
  return rows.map(row => ({
    id: row.id,
    googleEmail: row.google_email,
    status: row.status,
    scopes: row.scopes || [],
    lastDiscoveredAt: row.last_discovered_at,
    createdAt: row.created_at,
  }))
}

export async function reserveGtmApiQuota(requestCount: number): Promise<void> {
  if (!Number.isInteger(requestCount) || requestCount < 1 || requestCount > QUOTA_WINDOW_BUDGET) {
    throw new Error('Invalid GTM API quota reservation')
  }
  const row = await queryOne<{ request_count: number, window_started_at: string }>(
    `INSERT INTO gtm_api_quota_windows (quota_key, window_started_at, request_count)
     VALUES ('google-cloud-project', NOW(), $1)
     ON CONFLICT (quota_key)
     DO UPDATE SET
       window_started_at = CASE
         WHEN gtm_api_quota_windows.window_started_at <= NOW() - ($2 * INTERVAL '1 second') THEN NOW()
         ELSE gtm_api_quota_windows.window_started_at
       END,
       request_count = CASE
         WHEN gtm_api_quota_windows.window_started_at <= NOW() - ($2 * INTERVAL '1 second') THEN $1
         ELSE gtm_api_quota_windows.request_count + $1
       END,
       updated_at = NOW()
     WHERE gtm_api_quota_windows.window_started_at <= NOW() - ($2 * INTERVAL '1 second')
        OR gtm_api_quota_windows.request_count + $1 <= $3
     RETURNING request_count, window_started_at`,
    [requestCount, QUOTA_WINDOW_SECONDS, QUOTA_WINDOW_BUDGET],
  )
  if (!row) {
    throw createError({
      statusCode: 429,
      statusMessage: 'Google Tag Manager API pacing limit reached; retry in about 100 seconds',
    })
  }
}
