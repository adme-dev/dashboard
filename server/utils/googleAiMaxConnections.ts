import { queryRows } from '~~/server/utils/db'
import {
  GOOGLE_CREDENTIAL_PROFILE_JOIN,
  GOOGLE_CREDENTIAL_PROFILE_SELECT,
  persistGoogleCredentialRefresh,
  resolveGoogleCredential,
  type GoogleCredentialRow,
} from '~~/server/utils/googleCredentialProfiles'
import {
  listAccessibleCustomers,
  refreshGoogleToken,
} from '~~/server/utils/googleAdsClient'
import { resolveGoogleWriteAuth } from '~~/server/utils/googleWriteAuth'
import { resolveGoogleAdsRuntimeConfig } from '~~/server/utils/spendSync'
import type { GoogleAiMaxPortfolioAccount } from '~~/server/utils/googleAiMaxScanner'

export interface GoogleAiMaxConnectionRow extends GoogleCredentialRow {
  id: string
  account_id: string
  account_name: string | null
  metadata: Record<string, unknown> | null
}

interface GoogleAiMaxRuntimeConfig {
  googleClientId: string
  googleClientSecret: string
  googleDeveloperToken: string
  googleAdsLoginCustomerId: string
}

type ConnectionQuery = <T = any>(sql: string, params?: any[]) => Promise<T[]>

export async function listGoogleAiMaxConnectionRows(
  input: { tenantId: string, connectionId?: string },
  query: ConnectionQuery = queryRows,
): Promise<GoogleAiMaxConnectionRow[]> {
  const params: string[] = [input.tenantId]
  const connectionFilter = input.connectionId
    ? `AND sc.id = $${params.push(input.connectionId)}`
    : ''

  return query<GoogleAiMaxConnectionRow>(`
    SELECT sc.id, sc.account_id, sc.account_name, sc.access_token,
           sc.refresh_token, sc.token_expires_at, sc.metadata,
           ${GOOGLE_CREDENTIAL_PROFILE_SELECT}
    FROM social_connections sc
    ${GOOGLE_CREDENTIAL_PROFILE_JOIN}
    WHERE sc.platform = 'google'
      AND sc.status = 'active'
      AND EXISTS (
        SELECT 1
        FROM xero_org_connection xo
        WHERE xo.tenant_id = $1
      )
      ${connectionFilter}
    ORDER BY sc.account_name NULLS LAST, sc.account_id
  `, params)
}

interface LoadGoogleAiMaxScanContextDependencies {
  listRows: typeof listGoogleAiMaxConnectionRows
  getConfig: () => GoogleAiMaxRuntimeConfig
  resolveAccountAuth: (
    row: GoogleAiMaxConnectionRow,
    config: GoogleAiMaxRuntimeConfig,
  ) => Promise<{ accessToken: string, loginCustomerId?: string }>
}

async function resolveAccountAuth(
  row: GoogleAiMaxConnectionRow,
  config: GoogleAiMaxRuntimeConfig,
): Promise<{ accessToken: string, loginCustomerId?: string }> {
  const credential = await resolveGoogleCredential(row)
  const metadataManager = typeof row.metadata?.managerCustomerId === 'string'
    ? row.metadata.managerCustomerId
    : ''

  return resolveGoogleWriteAuth({
    id: row.id,
    account_id: row.account_id,
    access_token: credential.accessToken,
    refresh_token: credential.refreshToken,
    token_expires_at: credential.tokenExpiresAt,
  }, {
    googleClientId: config.googleClientId,
    googleClientSecret: config.googleClientSecret,
    googleDeveloperToken: config.googleDeveloperToken,
    googleAdsLoginCustomerId: config.googleAdsLoginCustomerId || metadataManager,
  }, {
    refreshGoogleToken,
    listAccessibleCustomers,
    updateToken: async (connectionId, accessToken, expiresAt) => {
      await persistGoogleCredentialRefresh({
        connectionId,
        profileId: credential.profileId,
        accessToken,
        expiresAt,
      })
    },
  })
}

const defaultDependencies: LoadGoogleAiMaxScanContextDependencies = {
  listRows: listGoogleAiMaxConnectionRows,
  getConfig: resolveGoogleAdsRuntimeConfig,
  resolveAccountAuth,
}

export async function loadGoogleAiMaxScanContext(
  input: { tenantId: string, connectionId?: string },
  dependencies: LoadGoogleAiMaxScanContextDependencies = defaultDependencies,
): Promise<{ developerToken: string, accounts: GoogleAiMaxPortfolioAccount[] }> {
  const config = dependencies.getConfig()
  if (!config.googleDeveloperToken) {
    throw new Error('Google Ads developer token is not configured')
  }

  const rows = await dependencies.listRows(input)
  return {
    developerToken: config.googleDeveloperToken,
    accounts: rows.map(row => ({
      connectionId: row.id,
      customerId: row.account_id,
      resolveAuth: () => dependencies.resolveAccountAuth(row, config),
    })),
  }
}
