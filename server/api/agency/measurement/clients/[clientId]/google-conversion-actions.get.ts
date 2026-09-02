import { z } from 'zod'
import { createError, defineEventHandler, getQuery, getRouterParam } from 'h3'
import { queryOne } from '~~/server/utils/db'
import { refreshGoogleToken } from '~~/server/utils/googleAdsClient'
import { listGoogleAdsInventory } from '~~/server/utils/googleAds/inventory'
import {
  GOOGLE_CREDENTIAL_PROFILE_JOIN,
  GOOGLE_CREDENTIAL_PROFILE_SELECT,
  persistGoogleCredentialRefresh,
  resolveGoogleCredential,
  type GoogleCredentialRow
} from '~~/server/utils/googleCredentialProfiles'
import {
  GoogleConversionActionDiscoveryError,
  googleConversionActionDiscovery
} from '~~/server/utils/googleConversionActions'
import { requireMeasurementClientAccess } from '~~/server/utils/measurement/access'
import { resolveGoogleAdsRuntimeConfig } from '~~/server/utils/spendSync'

const QuerySchema = z.strictObject({
  connectionId: z.string().uuid(),
  page: z.coerce.number().int().min(1).max(100).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
  mode: z.enum(['mappable', 'registry']).default('mappable')
})

interface ConnectionRow extends GoogleCredentialRow {
  id: string
  client_id: string
  account_id: string
  account_name: string
  status: string
  metadata: unknown
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? value as Record<string, unknown> : {}
}

function googleAccountId(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const normalized = value.replaceAll('-', '')
  return /^\d{10}$/.test(normalized) ? normalized : null
}

function loginCustomerId(metadata: unknown): string | null {
  const value = record(metadata)
  return googleAccountId(value.google_login_customer_id)
    ?? googleAccountId(value.login_customer_id)
    ?? googleAccountId(value.managerCustomerId)
}

export default defineEventHandler(async (event) => {
  const clientId = getRouterParam(event, 'clientId')
  if (!clientId) {
    throw createError({ statusCode: 400, statusMessage: 'Client ID is required' })
  }
  await requireMeasurementClientAccess(event, clientId, 'view')

  const parsedQuery = QuerySchema.safeParse(getQuery(event))
  if (!parsedQuery.success) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid conversion-action query' })
  }

  const connection = await queryOne<ConnectionRow>(
    `SELECT sc.id, sc.client_id, sc.account_id, sc.account_name, sc.status,
            sc.access_token, sc.refresh_token, sc.token_expires_at, sc.metadata,
            ${GOOGLE_CREDENTIAL_PROFILE_SELECT}
       FROM social_connections sc
       ${GOOGLE_CREDENTIAL_PROFILE_JOIN}
      WHERE sc.client_id = $1
        AND sc.id = $2
        AND sc.platform = 'google'
        AND sc.status = 'active'
      LIMIT 1`,
    [clientId, parsedQuery.data.connectionId]
  )
  if (!connection) {
    throw createError({ statusCode: 404, statusMessage: 'Google Ads connection not found' })
  }

  const config = resolveGoogleAdsRuntimeConfig(undefined, event)
  let credential
  try {
    credential = await resolveGoogleCredential(connection)
  } catch {
    throw createError({ statusCode: 401, statusMessage: 'Google Ads connection must be reconnected' })
  }

  let accessToken = credential.accessToken
  const expiry = credential.tokenExpiresAt ? new Date(credential.tokenExpiresAt).getTime() : 0
  if (!Number.isFinite(expiry) || expiry < Date.now() + 5 * 60 * 1000) {
    if (!credential.refreshToken || !config.googleClientId || !config.googleClientSecret) {
      throw createError({ statusCode: 401, statusMessage: 'Google Ads connection must be reconnected' })
    }
    try {
      const refreshed = await refreshGoogleToken(
        credential.refreshToken,
        config.googleClientId,
        config.googleClientSecret
      )
      accessToken = refreshed.access_token
      await persistGoogleCredentialRefresh({
        connectionId: connection.id,
        profileId: credential.profileId,
        accessToken,
        expiresAt: new Date(Date.now() + refreshed.expires_in * 1000)
      })
    } catch {
      throw createError({ statusCode: 401, statusMessage: 'Google Ads connection must be reconnected' })
    }
  }

  try {
    const operatingCustomerId = connection.account_id.replaceAll('-', '')
    const managerCustomerId = loginCustomerId(connection.metadata)
    if (parsedQuery.data.mode === 'registry') {
      if (parsedQuery.data.page !== 1) {
        throw new GoogleConversionActionDiscoveryError('GOOGLE_CONVERSION_ACTION_INPUT_INVALID')
      }
      const registry = await listGoogleAdsInventory({
        kind: 'conversion_action',
        customerId: operatingCustomerId,
        status: 'ALL',
        maxResults: parsedQuery.data.pageSize,
        activityWindow: 'LAST_30_DAYS',
        auth: {
          accessToken,
          developerToken: config.googleDeveloperToken,
          ...(managerCustomerId ? { loginCustomerId: managerCustomerId } : {})
        }
      })
      return {
        connection: {
          id: connection.id,
          accountId: connection.account_id,
          accountName: connection.account_name
        },
        items: registry.items,
        pagination: {
          page: 1,
          pageSize: parsedQuery.data.pageSize,
          hasNextPage: registry.truncated === true
        }
      }
    }
    const result = await googleConversionActionDiscovery.list({
      accountId: operatingCustomerId,
      accessToken,
      developerToken: config.googleDeveloperToken,
      loginCustomerId: managerCustomerId,
      page: parsedQuery.data.page,
      pageSize: parsedQuery.data.pageSize
    })
    return {
      connection: {
        id: connection.id,
        accountId: connection.account_id,
        accountName: connection.account_name
      },
      ...result
    }
  } catch (error) {
    if (
      error instanceof GoogleConversionActionDiscoveryError
      && error.code === 'GOOGLE_CONVERSION_ACTION_INPUT_INVALID'
    ) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid conversion-action query' })
    }
    throw createError({
      statusCode: 502,
      statusMessage: 'Google Ads conversion actions could not be loaded'
    })
  }
})
