import { z } from 'zod'
import { queryOne } from '~~/server/utils/db'
import {
  GOOGLE_CREDENTIAL_PROFILE_JOIN,
  GOOGLE_CREDENTIAL_PROFILE_SELECT,
  persistGoogleCredentialRefresh,
  resolveGoogleCredential,
  type GoogleCredentialRow
} from '~~/server/utils/googleCredentialProfiles'
import { listAccessibleCustomers, refreshGoogleToken } from '~~/server/utils/googleAdsClient'
import { resolveGoogleAdsRuntimeConfig } from '~~/server/utils/spendSync'
import {
  resolveGoogleWriteAuth,
  type GoogleWriteConfig
} from '~~/server/utils/googleWriteAuth'
import type { GoogleAdsAuth } from '~~/server/utils/googleAds/api'
import type { GoogleAdsConnectionBinding } from '~~/server/utils/googleAds/actionPlanner'

const UuidSchema = z.string().uuid()

export interface GoogleAdsControlConnectionRow extends GoogleCredentialRow {
  id: string
  client_id: string | null
  account_id: string
  platform: string
  status: string
  metadata: unknown
}

interface LoadConnectionDependencies {
  queryOne<T>(sql: string, params: unknown[]): Promise<T | null>
}

const defaultLoadDependencies: LoadConnectionDependencies = { queryOne }

export async function loadGoogleAdsControlConnection(
  rawClientId: string,
  rawConnectionId: string,
  dependencies: LoadConnectionDependencies = defaultLoadDependencies
): Promise<GoogleAdsControlConnectionRow | null> {
  const clientId = UuidSchema.parse(rawClientId)
  const connectionId = UuidSchema.parse(rawConnectionId)
  return dependencies.queryOne<GoogleAdsControlConnectionRow>(`
    SELECT
      sc.id, sc.client_id, sc.account_id, sc.platform, sc.status,
      sc.access_token, sc.refresh_token, sc.token_expires_at, sc.metadata,
      ${GOOGLE_CREDENTIAL_PROFILE_SELECT}
    FROM social_connections sc
    ${GOOGLE_CREDENTIAL_PROFILE_JOIN}
    WHERE sc.client_id = $1
      AND sc.id = $2
      AND sc.platform = 'google'
      AND sc.status = 'active'
  `, [clientId, connectionId])
}

export interface ResolveGoogleAdsControlSessionInput {
  clientId: string
  connectionId: string
}

interface ResolvedCredential {
  accessToken: string
  refreshToken: string | null
  tokenExpiresAt: string | null
  profileId: string | null
  source: 'profile' | 'legacy'
}

export interface ResolveGoogleAdsControlSessionDependencies {
  loadConnection(clientId: string, connectionId: string): Promise<GoogleAdsControlConnectionRow | null>
  resolveCredential(row: GoogleAdsControlConnectionRow): Promise<ResolvedCredential>
  resolveConfig(): GoogleWriteConfig
  resolveWriteAuth: typeof resolveGoogleWriteAuth
  refreshGoogleToken: typeof refreshGoogleToken
  listAccessibleCustomers: typeof listAccessibleCustomers
  persistAccessToken(input: {
    connectionId: string
    profileId: string | null
    accessToken: string
    expiresAt: Date
  }): Promise<void>
}

const defaultSessionDependencies: ResolveGoogleAdsControlSessionDependencies = {
  loadConnection: loadGoogleAdsControlConnection,
  resolveCredential: resolveGoogleCredential,
  resolveConfig: () => resolveGoogleAdsRuntimeConfig(),
  resolveWriteAuth: resolveGoogleWriteAuth,
  refreshGoogleToken,
  listAccessibleCustomers,
  persistAccessToken: persistGoogleCredentialRefresh
}

function cleanCustomerId(value: string): string {
  const cleaned = value.replace(/-/g, '')
  if (!/^\d{1,20}$/.test(cleaned)) throw new Error('Invalid Google Ads customer ID')
  return cleaned
}

function managerCustomerId(metadata: unknown): string {
  let parsed = metadata
  if (typeof parsed === 'string') {
    try {
      parsed = JSON.parse(parsed)
    } catch {
      return ''
    }
  }
  if (!parsed || typeof parsed !== 'object') return ''
  const record = parsed as Record<string, unknown>
  const candidate = typeof record.managerCustomerId === 'string'
    ? record.managerCustomerId
    : typeof record.loginCustomerId === 'string' ? record.loginCustomerId : ''
  return candidate ? cleanCustomerId(candidate) : ''
}

function assertConnectionBinding(
  row: GoogleAdsControlConnectionRow | null,
  input: ResolveGoogleAdsControlSessionInput
): asserts row is GoogleAdsControlConnectionRow {
  if (!row) throw new Error('Google Ads connection was not found')
  if (row.client_id !== input.clientId) {
    throw new Error('Google Ads connection is not assigned to the selected client')
  }
  if (row.id !== input.connectionId) throw new Error('Google Ads connection binding is invalid')
  if (row.platform !== 'google' || row.status !== 'active') {
    throw new Error('Google Ads connection is not active')
  }
}

export async function resolveGoogleAdsControlSession(
  rawInput: ResolveGoogleAdsControlSessionInput,
  overrides: Partial<ResolveGoogleAdsControlSessionDependencies> = {}
): Promise<{ connection: GoogleAdsConnectionBinding, auth: GoogleAdsAuth }> {
  const input = {
    clientId: UuidSchema.parse(rawInput.clientId),
    connectionId: UuidSchema.parse(rawInput.connectionId)
  }
  const dependencies = { ...defaultSessionDependencies, ...overrides }
  const row = await dependencies.loadConnection(input.clientId, input.connectionId)
  assertConnectionBinding(row, input)

  const config = dependencies.resolveConfig()
  if (!config.googleDeveloperToken) throw new Error('Google Ads developer token is not configured')
  const credential = await dependencies.resolveCredential(row)
  const metadataManager = managerCustomerId(row.metadata)
  const writeConfig: GoogleWriteConfig = {
    ...config,
    googleAdsLoginCustomerId: config.googleAdsLoginCustomerId || metadataManager
  }
  const resolved = await dependencies.resolveWriteAuth({
    id: row.id,
    account_id: row.account_id,
    access_token: credential.accessToken,
    refresh_token: credential.refreshToken,
    token_expires_at: credential.tokenExpiresAt
  }, writeConfig, {
    refreshGoogleToken: dependencies.refreshGoogleToken,
    listAccessibleCustomers: dependencies.listAccessibleCustomers,
    updateToken: (connectionId, accessToken, expiresAt) => dependencies.persistAccessToken({
      connectionId,
      profileId: credential.profileId,
      accessToken,
      expiresAt
    })
  })

  const customerId = cleanCustomerId(row.account_id)
  return {
    connection: {
      clientId: row.client_id,
      connectionId: row.id,
      customerId,
      platform: 'google',
      status: 'active'
    },
    auth: {
      accessToken: resolved.accessToken,
      developerToken: config.googleDeveloperToken,
      ...(resolved.loginCustomerId ? { loginCustomerId: cleanCustomerId(resolved.loginCustomerId) } : {})
    }
  }
}
