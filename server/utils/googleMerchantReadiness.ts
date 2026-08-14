import { z } from 'zod'

import { gaqlQuery } from '~~/server/utils/googleAdsClient'
import { createGoogleMerchantVehicleClient } from '~~/server/utils/googleMerchantVehicleCatalog'
import { loadGoogleMerchantCredentialProfile } from '~~/server/utils/googleMerchantCredentialProfile'
import { loadGooglePmaxProviderConnection } from '~~/server/utils/googlePmaxProviderConnection'
import type { GooglePmaxProviderConnection } from '~~/server/utils/googlePmaxProviderReadback'
import { queryRows as defaultQueryRows } from '~~/server/utils/db'

const ProductLinkRowSchema = z.strictObject({
  productLink: z.strictObject({
    type: z.string(),
    productLinkId: z.union([z.string(), z.number()]).transform(String),
    merchantCenter: z.strictObject({
      merchantCenterId: z.union([z.string(), z.number()]).transform(String)
    })
  }).passthrough()
})

interface MerchantCredentialBinding {
  profileId: string
  merchantAccountId: string
  registrationAccountId: string
  developerEmail: string
}

interface MerchantDataSourceReadModel {
  name: string
  displayName?: string
  inputType: 'API' | 'FILE' | 'UI' | 'AUTOFEED'
  writableByApi: boolean
  primaryProductDataSource?: {
    feedLabel?: string
    contentLanguage?: string
    destinations?: Array<{ destination: string, state: string }>
  }
}

interface GoogleMerchantReadinessDependencies {
  loadConnection?: typeof loadGooglePmaxProviderConnection
  queryAds?: (connection: GooglePmaxProviderConnection, query: string) => Promise<unknown[]>
  listDataSources?: (
    merchantAccountId: string,
    accessToken: string
  ) => Promise<MerchantDataSourceReadModel[]>
  listCredentialBindings?: (merchantAccountIds: string[]) => Promise<MerchantCredentialBinding[]>
  loadMerchantCredential?: typeof loadGoogleMerchantCredentialProfile
}

export class GoogleMerchantReadinessError extends Error {
  constructor(public readonly code:
    | 'MERCHANT_READINESS_LINK_RESPONSE_INVALID'
    | 'MERCHANT_READINESS_PROVIDER_UNAVAILABLE') {
    super(code)
    this.name = 'GoogleMerchantReadinessError'
  }
}

async function defaultQueryAds(connection: GooglePmaxProviderConnection, query: string) {
  return await gaqlQuery(
    connection.customerId,
    connection.accessToken,
    connection.developerToken,
    query,
    connection.loginCustomerId,
    1
  )
}

async function defaultListDataSources(merchantAccountId: string, accessToken: string) {
  return await createGoogleMerchantVehicleClient({ accessToken }).listDataSources(merchantAccountId)
}

async function defaultListCredentialBindings(merchantAccountIds: string[]) {
  if (merchantAccountIds.length === 0) return []
  const rows = await defaultQueryRows<{
    profile_id: string
    merchant_account_id: string
    registration_account_id: string
    developer_email: string
  }>(`
    SELECT profile.id AS profile_id,
           account_id.value AS merchant_account_id,
           profile.metadata->>'merchantParentId' AS registration_account_id,
           LOWER(profile.metadata->>'googleAccountEmail') AS developer_email
      FROM google_credential_profiles profile
      CROSS JOIN LATERAL jsonb_array_elements_text(
        CASE
          WHEN jsonb_typeof(profile.metadata->'merchantCenterIds') = 'array'
            THEN profile.metadata->'merchantCenterIds'
          ELSE '[]'::jsonb
        END
      ) account_id(value)
     WHERE profile.status = 'active'
       AND profile.metadata->>'purpose' = 'merchant'
       AND account_id.value = ANY($1::text[])
       AND 'https://www.googleapis.com/auth/content' = ANY(profile.scopes)
     ORDER BY profile.id, account_id.value
  `, [merchantAccountIds])
  return rows.map(row => ({
    profileId: row.profile_id,
    merchantAccountId: row.merchant_account_id,
    registrationAccountId: row.registration_account_id,
    developerEmail: row.developer_email
  }))
}

function safeDataSource(source: MerchantDataSourceReadModel) {
  return {
    name: source.name,
    displayName: source.displayName || '',
    inputType: source.inputType,
    writableByApi: source.writableByApi,
    feedLabel: source.primaryProductDataSource?.feedLabel || '',
    contentLanguage: source.primaryProductDataSource?.contentLanguage || '',
    destinations: (source.primaryProductDataSource?.destinations || []).map(destination => ({
      destination: destination.destination,
      state: destination.state
    }))
  }
}

export async function readGoogleMerchantReadiness(input: {
  tenantId: string
  clientId: string
  connectionId: string
  customerId: string
}, dependencies: GoogleMerchantReadinessDependencies = {}) {
  const loadConnection = dependencies.loadConnection || loadGooglePmaxProviderConnection
  const queryAds = dependencies.queryAds || defaultQueryAds
  const listDataSources = dependencies.listDataSources || defaultListDataSources
  const listCredentialBindings = dependencies.listCredentialBindings || defaultListCredentialBindings
  const loadMerchantCredential = dependencies.loadMerchantCredential || loadGoogleMerchantCredentialProfile
  const connection = await loadConnection(input)

  let rawLinks: unknown[]
  try {
    // Google Ads API v23 product_link is the authoritative Ads-to-Merchant relationship.
    rawLinks = await queryAds(connection, `
      SELECT product_link.merchant_center.merchant_center_id,
             product_link.product_link_id,
             product_link.type
        FROM product_link
       WHERE product_link.type = 'MERCHANT_CENTER'
    `.trim())
  } catch {
    throw new GoogleMerchantReadinessError('MERCHANT_READINESS_PROVIDER_UNAVAILABLE')
  }
  const parsed = z.array(ProductLinkRowSchema).safeParse(rawLinks)
  if (!parsed.success) {
    throw new GoogleMerchantReadinessError('MERCHANT_READINESS_LINK_RESPONSE_INVALID')
  }
  const links = [...new Map(parsed.data.map(row => [
    row.productLink.merchantCenter.merchantCenterId,
    {
      merchantAccountId: row.productLink.merchantCenter.merchantCenterId,
      productLinkId: row.productLink.productLinkId
    }
  ])).values()].sort((a, b) => a.merchantAccountId.localeCompare(b.merchantAccountId))
  const bindings = await listCredentialBindings(links.map(link => link.merchantAccountId))

  const merchantAccounts = await Promise.all(links.map(async (link) => {
    const matchingBindings = bindings.filter(binding => (
      binding.merchantAccountId === link.merchantAccountId
      && /^\d{6,20}$/.test(binding.registrationAccountId)
      && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(binding.developerEmail)
    ))
    const credentialBinding = matchingBindings.length === 1 ? matchingBindings[0]! : null
    let sources: MerchantDataSourceReadModel[] = []
    let readAccess: 'verified' | 'denied' = 'verified'
    try {
      let accessToken = connection.accessToken
      if (credentialBinding) {
        const credential = await loadMerchantCredential({
          profileId: credentialBinding.profileId,
          merchantAccountId: link.merchantAccountId,
          developerEmail: credentialBinding.developerEmail
        })
        if (credential.registrationAccountId !== credentialBinding.registrationAccountId) {
          throw new GoogleMerchantReadinessError('MERCHANT_READINESS_PROVIDER_UNAVAILABLE')
        }
        accessToken = credential.accessToken
      }
      sources = await listDataSources(link.merchantAccountId, accessToken)
    } catch {
      readAccess = 'denied'
    }
    return {
      ...link,
      readAccess,
      credentialBinding: credentialBinding
        ? {
            profileId: credentialBinding.profileId,
            registrationAccountId: credentialBinding.registrationAccountId,
            developerEmail: credentialBinding.developerEmail
          }
        : null,
      dataSources: readAccess === 'verified' ? sources.map(safeDataSource) : []
    }
  }))
  const linkStatus = merchantAccounts.length === 0
    ? 'missing' as const
    : merchantAccounts.length === 1
      ? 'verified' as const
      : 'ambiguous' as const
  const account = linkStatus === 'verified' ? merchantAccounts[0]! : null
  const readyForCatalogBinding = Boolean(
    account && account.readAccess === 'verified' && account.credentialBinding
  )
  const readyForPublication = Boolean(
    readyForCatalogBinding
    && account?.dataSources.some(source => (
      source.writableByApi
      && source.destinations.some(destination => (
        destination.destination === 'VEHICLE_ADS' && destination.state === 'ENABLED'
      ))
    ))
  )
  return {
    customerId: connection.customerId,
    linkStatus,
    merchantAccounts,
    readyForCatalogBinding,
    readyForPublication
  }
}
