import { z } from 'zod'
import { gaqlQuery } from '~~/server/utils/googleAdsClient'
import type { GooglePmaxInventoryLaunchConfig } from '~~/server/utils/googlePmaxLaunchConfig'
import type { GooglePmaxPreflightEvidence } from '~~/server/utils/googlePmaxPreflight'

const AccountRowSchema = z.strictObject({
  customer: z.strictObject({
    id: z.union([z.string(), z.number()]).transform(String),
    currencyCode: z.string().trim().min(3).max(3),
    timeZone: z.string().trim().min(1).max(100),
    status: z.string().trim().min(1).max(50)
  })
})

const ProductLinkRowSchema = z.strictObject({
  productLink: z.strictObject({
    type: z.string(),
    merchantCenter: z.strictObject({
      merchantCenterId: z.union([z.string(), z.number()]).transform(String)
    }).optional()
  })
})

const ConversionRowSchema = z.strictObject({
  conversionAction: z.strictObject({
    id: z.union([z.string(), z.number()]).transform(String),
    resourceName: z.string(),
    status: z.string(),
    primaryForGoal: z.boolean(),
    includeInConversionsMetric: z.boolean()
  }),
  metrics: z.strictObject({
    allConversions: z.union([z.string(), z.number()]).transform(Number).optional()
  }).optional()
})

const AssetRowSchema = z.strictObject({
  asset: z.strictObject({
    resourceName: z.string(),
    status: z.string()
  })
})

const MerchantProductSchema = z.object({
  name: z.string().min(1),
  productAttributes: z.object({
    link: z.string().optional(),
    mobileLink: z.string().optional()
  }).passthrough().optional(),
  productStatus: z.object({
    destinationStatuses: z.array(z.object({
      reportingContext: z.string(),
      approvedCountries: z.array(z.string()).optional(),
      pendingCountries: z.array(z.string()).optional(),
      disapprovedCountries: z.array(z.string()).optional()
    }).passthrough()).optional()
  }).passthrough().optional()
}).passthrough()

const MerchantPageSchema = z.object({
  products: z.array(MerchantProductSchema).optional(),
  nextPageToken: z.string().min(1).optional()
}).passthrough()

export interface GooglePmaxProviderConnection {
  id: string
  clientId: string
  status: 'active' | 'inactive' | 'error'
  customerId: string
  accessToken: string
  developerToken: string
  loginCustomerId?: string
}

export interface GoogleMerchantVehicleEvidence {
  sourceStatus: 'healthy' | 'warning' | 'error'
  eligibleItemCount: number
  vehicleItemCount: number
  disapprovedItemCount: number
  allowedFinalUrlHosts: string[]
  complete: boolean
  requestId: string | null
}

type InternalFeedEvidence = GooglePmaxPreflightEvidence['internalFeed']

interface ProviderReadbackDependencies {
  readConnection: (config: GooglePmaxInventoryLaunchConfig) => Promise<GooglePmaxProviderConnection>
  readInternalFeed: (config: GooglePmaxInventoryLaunchConfig) => Promise<InternalFeedEvidence>
  queryAds?: (connection: GooglePmaxProviderConnection, query: string) => Promise<unknown[]>
  readMerchant?: (input: {
    merchantCenterId: string
    accessToken: string
  }) => Promise<GoogleMerchantVehicleEvidence>
}

export class GooglePmaxProviderReadbackError extends Error {
  constructor(public readonly code:
    | 'PMAX_PROVIDER_CONNECTION_SCOPE_MISMATCH'
    | 'PMAX_PROVIDER_ACCOUNT_RESPONSE_INVALID'
    | 'PMAX_PROVIDER_LINK_RESPONSE_INVALID'
    | 'PMAX_PROVIDER_CONVERSION_RESPONSE_INVALID'
    | 'PMAX_PROVIDER_ASSET_RESPONSE_INVALID'
    | 'PMAX_MERCHANT_REQUEST_FAILED'
    | 'PMAX_MERCHANT_RESPONSE_INVALID') {
    super('Google launch provider evidence could not be verified.')
    this.name = 'GooglePmaxProviderReadbackError'
  }
}

function safeRequestId(value: unknown): string | null {
  return typeof value === 'string' && /^[A-Za-z0-9_.:-]{1,255}$/.test(value)
    ? value
    : null
}

function normalizedHost(value: string): string | null {
  try {
    const host = new URL(value).hostname.toLowerCase().replace(/^www\./, '')
    return host || null
  } catch {
    return null
  }
}

function responseRequestId(response: Response): string | null {
  for (const key of ['x-request-id', 'x-guploader-uploadid', 'x-goog-request-id']) {
    const value = safeRequestId(response.headers.get(key))
    if (value) return value
  }
  return null
}

export async function readGoogleMerchantVehicleEvidence(input: {
  merchantCenterId: string
  accessToken: string
  fetch?: typeof globalThis.fetch
  maximumProducts?: number
}): Promise<GoogleMerchantVehicleEvidence> {
  if (!/^\d+$/.test(input.merchantCenterId) || !input.accessToken) {
    throw new GooglePmaxProviderReadbackError('PMAX_MERCHANT_REQUEST_FAILED')
  }
  const fetcher = input.fetch || globalThis.fetch
  const maximumProducts = Math.min(Math.max(input.maximumProducts || 1000, 1), 2000)
  const products: z.infer<typeof MerchantProductSchema>[] = []
  let pageToken = ''
  let requestId: string | null = null
  let complete = true

  while (products.length < maximumProducts) {
    const remaining = maximumProducts - products.length
    const params = new URLSearchParams({ pageSize: String(Math.min(250, remaining)) })
    if (pageToken) params.set('pageToken', pageToken)
    const response = await fetcher(
      `https://merchantapi.googleapis.com/products/v1/accounts/${input.merchantCenterId}/products?${params}`,
      {
        method: 'GET',
        headers: { Authorization: `Bearer ${input.accessToken}` }
      }
    )
    requestId ||= responseRequestId(response)
    if (!response.ok) throw new GooglePmaxProviderReadbackError('PMAX_MERCHANT_REQUEST_FAILED')

    let payload: unknown
    try {
      payload = await response.json()
    } catch {
      throw new GooglePmaxProviderReadbackError('PMAX_MERCHANT_RESPONSE_INVALID')
    }
    const parsed = MerchantPageSchema.safeParse(payload)
    if (!parsed.success) throw new GooglePmaxProviderReadbackError('PMAX_MERCHANT_RESPONSE_INVALID')
    products.push(...(parsed.data.products || []))
    pageToken = parsed.data.nextPageToken || ''
    if (!pageToken) break
    if (products.length >= maximumProducts) complete = false
  }

  let eligibleItemCount = 0
  let vehicleItemCount = 0
  let disapprovedItemCount = 0
  const hosts = new Set<string>()
  for (const product of products) {
    const status = product.productStatus?.destinationStatuses?.find(item => (
      item.reportingContext === 'VEHICLE_INVENTORY_ADS'
    ))
    if (!status) continue
    vehicleItemCount += 1
    const approved = (status.approvedCountries || []).includes('AU')
    const disapproved = (status.disapprovedCountries || []).includes('AU')
    if (approved) eligibleItemCount += 1
    if (disapproved) disapprovedItemCount += 1
    for (const url of [product.productAttributes?.link, product.productAttributes?.mobileLink]) {
      if (!url) continue
      const host = normalizedHost(url)
      if (host) hosts.add(host)
    }
  }

  const sourceStatus = vehicleItemCount <= 0 || eligibleItemCount <= 0
    ? 'error'
    : disapprovedItemCount > 0
      ? 'warning'
      : 'healthy'
  return {
    sourceStatus,
    eligibleItemCount,
    vehicleItemCount,
    disapprovedItemCount,
    allowedFinalUrlHosts: [...hosts].sort(),
    complete,
    requestId
  }
}

async function defaultQueryAds(
  connection: GooglePmaxProviderConnection,
  query: string
): Promise<unknown[]> {
  return gaqlQuery(
    connection.customerId,
    connection.accessToken,
    connection.developerToken,
    query,
    connection.loginCustomerId
  )
}

function quotedResourceNames(values: string[]): string {
  return values.map(value => `'${value}'`).join(', ')
}

function exactAssetResources(config: GooglePmaxInventoryLaunchConfig): string[] {
  return [...new Set([
    ...config.assetGroup.imageAssetResourceNames,
    ...config.assetGroup.logoAssetResourceNames,
    ...config.assetGroup.youtubeVideoAssetResourceNames
  ])].sort()
}

function assetsEvidence(
  config: GooglePmaxInventoryLaunchConfig,
  rows: Array<z.infer<typeof AssetRowSchema>>
): GooglePmaxPreflightEvidence['assets'] {
  if (config.assetGroup.mode === 'MERCHANT_ONLY') {
    return {
      mode: 'merchant_only',
      textCoverageComplete: true,
      mediaCoverageComplete: true,
      allApproved: true
    }
  }
  const expected = exactAssetResources(config)
  const returned = new Map(rows.map(row => [row.asset.resourceName, row.asset.status]))
  const textCoverageComplete = Boolean(config.assetGroup.businessName)
    && config.assetGroup.headlines.length >= 3
    && config.assetGroup.longHeadlines.length >= 1
    && config.assetGroup.descriptions.length >= 2
  const mediaCoverageComplete = config.assetGroup.imageAssetResourceNames.length >= 1
    && config.assetGroup.logoAssetResourceNames.length >= 1
    && expected.every(resourceName => returned.has(resourceName))
  const allApproved = mediaCoverageComplete
    && expected.every(resourceName => returned.get(resourceName) === 'ENABLED')
  return {
    mode: 'provided',
    textCoverageComplete,
    mediaCoverageComplete,
    allApproved
  }
}

export function createGooglePmaxProviderEvidenceReader(dependencies: ProviderReadbackDependencies) {
  const queryAds = dependencies.queryAds || defaultQueryAds
  const readMerchant = dependencies.readMerchant || (input => readGoogleMerchantVehicleEvidence(input))
  return {
    async read(config: GooglePmaxInventoryLaunchConfig): Promise<GooglePmaxPreflightEvidence> {
      const connection = await dependencies.readConnection(config)
      if (
        connection.id.toLowerCase() !== config.connectionId.toLowerCase()
        || connection.clientId.toLowerCase() !== config.clientId.toLowerCase()
        || connection.customerId.replace(/-/g, '') !== config.customerId
      ) {
        throw new GooglePmaxProviderReadbackError('PMAX_PROVIDER_CONNECTION_SCOPE_MISMATCH')
      }

      const [rawAccountRows, rawLinkRows, rawConversionRows, internalFeed, merchant] = await Promise.all([
        queryAds(connection, `
          SELECT customer.id, customer.currency_code, customer.time_zone, customer.status
          FROM customer
          LIMIT 1
        `.trim()),
        queryAds(connection, `
          SELECT product_link.type, product_link.merchant_center.merchant_center_id
          FROM product_link
          WHERE product_link.type = 'MERCHANT_CENTER'
        `.trim()),
        config.conversionGoals.length
          ? queryAds(connection, `
              SELECT conversion_action.id, conversion_action.resource_name,
                     conversion_action.status, conversion_action.primary_for_goal,
                     conversion_action.include_in_conversions_metric,
                     metrics.all_conversions
              FROM conversion_action
              WHERE conversion_action.id IN (${config.conversionGoals.map(goal => goal.conversionActionId).join(', ')})
                AND segments.date DURING LAST_30_DAYS
            `.trim())
          : Promise.resolve([]),
        dependencies.readInternalFeed(config),
        readMerchant({
          merchantCenterId: config.merchantCenterId,
          accessToken: connection.accessToken
        })
      ])

      const accountRows = z.array(AccountRowSchema).safeParse(rawAccountRows)
      if (!accountRows.success || accountRows.data.length !== 1) {
        throw new GooglePmaxProviderReadbackError('PMAX_PROVIDER_ACCOUNT_RESPONSE_INVALID')
      }
      const linkRows = z.array(ProductLinkRowSchema).safeParse(rawLinkRows)
      if (!linkRows.success) throw new GooglePmaxProviderReadbackError('PMAX_PROVIDER_LINK_RESPONSE_INVALID')
      const conversionRows = z.array(ConversionRowSchema).safeParse(rawConversionRows)
      if (!conversionRows.success) {
        throw new GooglePmaxProviderReadbackError('PMAX_PROVIDER_CONVERSION_RESPONSE_INVALID')
      }

      const expectedAssets = exactAssetResources(config)
      const rawAssetRows = expectedAssets.length
        ? await queryAds(connection, `
            SELECT asset.resource_name, asset.status
            FROM asset
            WHERE asset.resource_name IN (${quotedResourceNames(expectedAssets)})
          `.trim())
        : []
      const assetRows = z.array(AssetRowSchema).safeParse(rawAssetRows)
      if (!assetRows.success) throw new GooglePmaxProviderReadbackError('PMAX_PROVIDER_ASSET_RESPONSE_INVALID')

      const account = accountRows.data[0]!.customer
      const linkedMerchantCenterIds = [...new Set(linkRows.data
        .filter(row => row.productLink.type === 'MERCHANT_CENTER')
        .map(row => row.productLink.merchantCenter?.merchantCenterId || '')
        .filter(Boolean))].sort()
      const merchantComplete = merchant.complete
      const allowedHosts = new Set(merchant.allowedFinalUrlHosts.map(host => host.toLowerCase().replace(/^www\./, '')))
      const allFinalUrlsVerified = merchantComplete && config.finalUrls.every((url) => {
        const host = normalizedHost(url)
        return Boolean(host && allowedHosts.has(host))
      })

      return {
        providerRequestId: safeRequestId(merchant.requestId),
        connection: {
          id: connection.id,
          clientId: connection.clientId,
          status: connection.status === 'active' && account.status === 'ENABLED' ? 'active' : 'error',
          customerId: account.id,
          currency: account.currencyCode,
          timezone: account.timeZone
        },
        merchant: {
          linkedMerchantCenterIds,
          sourceStatus: merchantComplete ? merchant.sourceStatus : 'error',
          eligibleItemCount: merchantComplete ? merchant.eligibleItemCount : 0,
          vehicleItemCount: merchantComplete ? merchant.vehicleItemCount : 0,
          disapprovedItemCount: merchantComplete ? merchant.disapprovedItemCount : 0
        },
        internalFeed,
        conversions: conversionRows.data.map(row => ({
          conversionActionId: row.conversionAction.id,
          resourceName: row.conversionAction.resourceName,
          status: row.conversionAction.status === 'ENABLED' ? 'ENABLED' : 'REMOVED',
          primaryForGoal: row.conversionAction.primaryForGoal,
          includeInConversionsMetric: row.conversionAction.includeInConversionsMetric,
          recentConversions: Number(row.metrics?.allConversions || 0) > 0
        })),
        assets: assetsEvidence(config, assetRows.data),
        destinations: { allFinalUrlsVerified }
      }
    }
  }
}
