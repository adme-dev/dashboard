import { queryOne as defaultQueryOne } from '~~/server/utils/db'
import {
  listAccessibleCustomers,
  refreshGoogleToken
} from '~~/server/utils/googleAdsClient'
import { resolveGoogleAiMaxLoginCustomerId } from '~~/server/utils/googleAiMaxConnections'
import {
  GOOGLE_CREDENTIAL_PROFILE_JOIN,
  GOOGLE_CREDENTIAL_PROFILE_SELECT,
  persistGoogleCredentialRefresh,
  resolveGoogleCredential,
  type GoogleCredentialRow
} from '~~/server/utils/googleCredentialProfiles'
import type { GooglePmaxInventoryLaunchConfig } from '~~/server/utils/googlePmaxLaunchConfig'
import type { GooglePmaxProviderConnection } from '~~/server/utils/googlePmaxProviderReadback'
import { resolveGoogleWriteAuth } from '~~/server/utils/googleWriteAuth'
import { resolveGoogleAdsRuntimeConfig } from '~~/server/utils/spendSync'

interface ConnectionRow extends GoogleCredentialRow {
  id: string
  client_id: string
  account_id: string
  status: string
  metadata: Record<string, unknown> | null
}

interface RuntimeConfig {
  googleClientId: string
  googleClientSecret: string
  googleDeveloperToken: string
  googleAdsLoginCustomerId: string
}

interface ProviderConnectionDependencies {
  queryOne?: <T = unknown>(sql: string, params?: unknown[]) => Promise<T | null>
  getRuntimeConfig?: () => RuntimeConfig
  resolveCredential?: typeof resolveGoogleCredential
  resolveAuth?: typeof resolveGoogleWriteAuth
  persistRefresh?: typeof persistGoogleCredentialRefresh
  refreshToken?: typeof refreshGoogleToken
  listAccessibleCustomers?: typeof listAccessibleCustomers
}

export class GooglePmaxProviderConnectionError extends Error {
  constructor(public readonly code:
    | 'PMAX_PROVIDER_CONNECTION_NOT_FOUND'
    | 'PMAX_PROVIDER_CONNECTION_IDENTITY_MISMATCH'
    | 'PMAX_PROVIDER_RUNTIME_NOT_CONFIGURED'
    | 'PMAX_PROVIDER_CREDENTIAL_UNAVAILABLE') {
    super('The scoped Google Ads provider connection is unavailable.')
    this.name = 'GooglePmaxProviderConnectionError'
  }
}

function accountId(value: string): string {
  return value.replace(/-/g, '')
}

export async function loadGooglePmaxProviderConnection(
  config: Pick<GooglePmaxInventoryLaunchConfig,
    'tenantId' | 'clientId' | 'connectionId' | 'customerId'>,
  dependencies: ProviderConnectionDependencies = {}
): Promise<GooglePmaxProviderConnection> {
  const queryOne = dependencies.queryOne || defaultQueryOne
  const row = await queryOne<ConnectionRow>(
    `SELECT sc.id, sc.client_id, sc.account_id, sc.status, sc.metadata,
            sc.access_token, sc.refresh_token, sc.token_expires_at,
            ${GOOGLE_CREDENTIAL_PROFILE_SELECT}
       FROM social_connections sc
       ${GOOGLE_CREDENTIAL_PROFILE_JOIN}
      WHERE sc.id = $1::uuid
        AND sc.client_id = $2::uuid
        AND sc.platform = 'google'
        AND sc.status = 'active'
        AND $3::text = (
          SELECT tenant_id
            FROM xero_org_connection
           WHERE tenant_id <> '__default__'
           ORDER BY updated_at DESC
           LIMIT 1
        )
      LIMIT 1`,
    [config.connectionId, config.clientId, config.tenantId]
  )
  if (!row) throw new GooglePmaxProviderConnectionError('PMAX_PROVIDER_CONNECTION_NOT_FOUND')
  if (
    row.id.toLowerCase() !== config.connectionId.toLowerCase()
    || row.client_id.toLowerCase() !== config.clientId.toLowerCase()
    || accountId(row.account_id) !== config.customerId
    || row.status !== 'active'
  ) {
    throw new GooglePmaxProviderConnectionError('PMAX_PROVIDER_CONNECTION_IDENTITY_MISMATCH')
  }

  const runtime = (dependencies.getRuntimeConfig || (() => resolveGoogleAdsRuntimeConfig()))()
  if (
    !runtime.googleClientId
    || !runtime.googleClientSecret
    || !runtime.googleDeveloperToken
  ) {
    throw new GooglePmaxProviderConnectionError('PMAX_PROVIDER_RUNTIME_NOT_CONFIGURED')
  }

  let credential
  try {
    credential = await (dependencies.resolveCredential || resolveGoogleCredential)(row)
  } catch {
    throw new GooglePmaxProviderConnectionError('PMAX_PROVIDER_CREDENTIAL_UNAVAILABLE')
  }
  const configuredManagerId = resolveGoogleAiMaxLoginCustomerId(
    row.metadata,
    runtime.googleAdsLoginCustomerId
  )
  let auth
  try {
    auth = await (dependencies.resolveAuth || resolveGoogleWriteAuth)({
      id: row.id,
      account_id: accountId(row.account_id),
      access_token: credential.accessToken,
      refresh_token: credential.refreshToken,
      token_expires_at: credential.tokenExpiresAt
    }, {
      ...runtime,
      googleAdsLoginCustomerId: configuredManagerId
    }, {
      refreshGoogleToken: dependencies.refreshToken || refreshGoogleToken,
      listAccessibleCustomers: dependencies.listAccessibleCustomers || listAccessibleCustomers,
      updateToken: async (connectionId, accessToken, expiresAt) => {
        await (dependencies.persistRefresh || persistGoogleCredentialRefresh)({
          connectionId,
          profileId: credential.profileId,
          accessToken,
          expiresAt
        })
      }
    })
  } catch {
    throw new GooglePmaxProviderConnectionError('PMAX_PROVIDER_CREDENTIAL_UNAVAILABLE')
  }

  return {
    id: row.id,
    clientId: row.client_id,
    status: 'active',
    customerId: accountId(row.account_id),
    accessToken: auth.accessToken,
    developerToken: runtime.googleDeveloperToken,
    ...(auth.loginCustomerId ? { loginCustomerId: auth.loginCustomerId } : {})
  }
}
