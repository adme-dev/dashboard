import { z } from 'zod'

const MERCHANT_API_ROOT = 'https://merchantapi.googleapis.com'
const ACCOUNT_ID = /^\d+$/
const DATA_SOURCE_NAME = /^accounts\/(\d+)\/dataSources\/(\d+)$/
const SAFE_REQUEST_ID = /^[A-Za-z0-9_.:-]{1,255}$/

export interface GoogleMerchantVehicleProduct {
  id: string
  sourceProductId: string
  stockId: string
  name: string
  price: number | string
  currency: string
  productUrl: string
  primaryImageUrl: string
  availability: string
  attributes: Record<string, unknown>
}

export interface GoogleMerchantVehicleConfig {
  merchantAccountId: string
  dataSource: string
  feedLabel: string
  contentLanguage: string
  storeCode: string
  newVehiclePriceSource?: 'CATALOG_PRICE_DRIVE_AWAY'
}

export interface GoogleMerchantVehicleProductInput {
  offerId: string
  contentLanguage: string
  feedLabel: string
  legacyLocal: true
  productAttributes: {
    title: string
    description: string
    link: string
    imageLink: string
    availability: 'IN_STOCK'
    price: { amountMicros: string, currencyCode: string }
    condition: 'NEW' | 'USED'
    brand: string
    color: string
    googleProductCategory: '916'
    includedDestinations: ['VEHICLE_ADS']
    vin: string
    model: string
    trim?: string
    bodyStyle?: string
    year: string
    mileage: { value: string, unit: 'KM' | 'MILES' }
    vehiclePriceType:
      | 'DRIVE_AWAY_PRICE'
      | 'ESTIMATED_DRIVE_AWAY_PRICE'
      | 'EXCLUDING_GOVERNMENT_CHARGES_PRICE'
  }
  customAttributes: Array<{
    name: 'vehicle_fulfillment'
    groupValues: Array<{ name: 'option' | 'store_code', value: string }>
  } | {
    name: 'link_template'
    value: string
  }>
}

export interface GoogleMerchantVehiclePublication {
  productId: string
  offerId: string
  state: string
  merchantDataSource?: string
}

export interface GoogleMerchantVehicleProcessedProduct {
  name: string
  offerId: string
  contentLanguage?: string
  feedLabel?: string
  dataSource: string
  productStatus?: {
    destinationStatuses: Array<{
      reportingContext: string
      approvedCountries: string[]
      pendingCountries: string[]
      disapprovedCountries: string[]
    }>
    itemLevelIssues: Array<{
      code: string
      severity?: string
      resolution?: string
      attribute?: string
      reportingContext?: string
      description?: string
      detail?: string
      documentation?: string
      applicableCountries: string[]
    }>
  }
}

export interface GoogleMerchantVehicleReconciliationPlan {
  publish: Array<{
    productId: string
    offerId: string
    productInput: GoogleMerchantVehicleProductInput
  }>
  delete: Array<{ productId: string, offerId: string }>
  excluded: Array<{
    productId: string
    offerId: string
    reason: 'DUPLICATE_VIN' | 'DUPLICATE_OFFER_ID' | 'INELIGIBLE' | 'INCOMPLETE'
  }>
}

export class GoogleMerchantVehicleCatalogError extends Error {
  constructor(
    public readonly code:
      | 'MERCHANT_VEHICLE_CONFIG_INVALID'
      | 'MERCHANT_VEHICLE_PRODUCT_INELIGIBLE'
      | 'MERCHANT_VEHICLE_PRODUCT_INCOMPLETE'
      | 'MERCHANT_VEHICLE_REQUEST_FAILED'
      | 'MERCHANT_VEHICLE_RESPONSE_INVALID',
    public readonly httpStatus: number | null = null,
    public readonly providerReason: string | null = null
  ) {
    super(code)
    this.name = 'GoogleMerchantVehicleCatalogError'
  }
}

async function merchantRequestError(response: Response) {
  let body: Record<string, unknown> | null = null
  try {
    const value = await response.clone().json()
    body = value && typeof value === 'object' && !Array.isArray(value)
      ? value as Record<string, unknown>
      : null
  } catch {
    // Provider error bodies are not guaranteed to be JSON.
  }
  const error = body?.error && typeof body.error === 'object' && !Array.isArray(body.error)
    ? body.error as Record<string, unknown>
    : null
  const status = typeof error?.status === 'string' && /^[A-Z_]{1,80}$/.test(error.status)
    ? error.status
    : null
  const message = typeof error?.message === 'string' ? error.message.toLowerCase() : ''
  const reason = message.includes('not registered with the merchant account')
    ? 'GCP_PROJECT_NOT_REGISTERED'
    : message.includes('has not been used in project') || message.includes('is disabled')
      ? 'MERCHANT_API_DISABLED'
      : message.includes('admin') || message.includes('permission')
        ? 'MERCHANT_ADMIN_REQUIRED'
        : status
  return new GoogleMerchantVehicleCatalogError(
    'MERCHANT_VEHICLE_REQUEST_FAILED', response.status, reason
  )
}

const DataSourceSchema = z.object({
  name: z.string().regex(DATA_SOURCE_NAME),
  displayName: z.string().optional(),
  input: z.enum(['API', 'FILE', 'UI', 'AUTOFEED', 'INPUT_UNSPECIFIED']).optional(),
  primaryProductDataSource: z.object({
    legacyLocal: z.boolean().optional(),
    feedLabel: z.string().optional(),
    contentLanguage: z.string().optional(),
    countries: z.array(z.string()).optional(),
    destinations: z.array(z.object({
      destination: z.string(),
      state: z.string()
    }).passthrough()).optional()
  }).passthrough().optional(),
  fileInput: z.record(z.string(), z.unknown()).optional()
}).passthrough()

const DataSourceListSchema = z.object({
  dataSources: z.array(DataSourceSchema).optional(),
  nextPageToken: z.string().min(1).optional()
}).passthrough()

const ProductInputResponseSchema = z.object({
  name: z.string().min(1),
  product: z.string().min(1),
  offerId: z.string().min(1)
}).passthrough()

const ProcessedProductSchema = z.object({
  name: z.string().min(1),
  offerId: z.string().min(1),
  contentLanguage: z.string().optional(),
  feedLabel: z.string().optional(),
  dataSource: z.string().regex(DATA_SOURCE_NAME),
  productStatus: z.object({
    destinationStatuses: z.array(z.object({
      reportingContext: z.string(),
      approvedCountries: z.array(z.string()).optional().default([]),
      pendingCountries: z.array(z.string()).optional().default([]),
      disapprovedCountries: z.array(z.string()).optional().default([])
    }).passthrough()).optional().default([]),
    itemLevelIssues: z.array(z.object({
      code: z.string(),
      severity: z.string().optional(),
      resolution: z.string().optional(),
      attribute: z.string().optional(),
      reportingContext: z.string().optional(),
      description: z.string().optional(),
      detail: z.string().optional(),
      documentation: z.string().optional(),
      applicableCountries: z.array(z.string()).optional().default([])
    }).passthrough()).optional().default([])
  }).passthrough().optional()
}).passthrough()

const ProcessedProductListSchema = z.object({
  products: z.array(ProcessedProductSchema).optional(),
  nextPageToken: z.string().min(1).optional()
}).passthrough()

function text(value: unknown, max = 5000): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

function positiveNumber(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

function nonNegativeNumber(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
}

function merchantRequestId(response: Response): string | null {
  for (const header of ['x-request-id', 'x-goog-request-id', 'x-guploader-uploadid']) {
    const value = response.headers.get(header)
    if (value && SAFE_REQUEST_ID.test(value)) return value
  }
  return null
}

function assertConfig(config: GoogleMerchantVehicleConfig): void {
  const sourceMatch = DATA_SOURCE_NAME.exec(config.dataSource)
  if (
    !ACCOUNT_ID.test(config.merchantAccountId)
    || !sourceMatch
    || sourceMatch[1] !== config.merchantAccountId
    || !/^[A-Z0-9_-]{1,20}$/.test(config.feedLabel)
    || !/^[a-z]{2}$/.test(config.contentLanguage)
    || !/^[A-Za-z0-9_-]{1,64}$/.test(config.storeCode)
  ) throw new GoogleMerchantVehicleCatalogError('MERCHANT_VEHICLE_CONFIG_INVALID')
}

function bodyStyle(value: unknown): string | undefined {
  const normalized = text(value, 80).toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '')
  const aliases: Record<string, string> = {
    CAB_CHASSIS: 'UTE', DUAL_CAB: 'UTE', PICKUP: 'UTE', PICK_UP: 'UTE',
    WAGON: 'STATION_WAGON', VAN: 'FULL_SIZE_VAN', PEOPLE_MOVER: 'MINIVAN'
  }
  const supported = new Set([
    'CITY_CAR', 'COMPACT_SUV', 'CONVERTIBLE', 'COUPE', 'CROSSOVER',
    'FULL_SIZE_VAN', 'HATCHBACK', 'LIMOUSINE', 'MINIVAN', 'NOTCHBACK',
    'SEDAN', 'STATION_WAGON', 'SUV', 'TRUCK', 'UTE'
  ])
  const candidate = aliases[normalized] || normalized
  return supported.has(candidate) ? candidate : undefined
}

function year(attributes: Record<string, unknown>): string {
  const raw = attributes.build_year || attributes.release_year || attributes.release_date_year
  const value = typeof raw === 'number' && Number.isInteger(raw)
    ? String(raw)
    : text(raw, 4)
  return /^(19|20)\d{2}$/.test(value) ? value : ''
}

function condition(attributes: Record<string, unknown>): 'NEW' | 'USED' | null {
  const listingType = text(attributes.listing_type, 40).toLowerCase()
  if (listingType === 'new') return 'NEW'
  if (listingType === 'demo' || listingType === 'used') return 'USED'
  return null
}

function price(
  catalogPrice: unknown,
  attributes: Record<string, unknown>,
  listingCondition: 'NEW' | 'USED',
  config: GoogleMerchantVehicleConfig
) {
  const driveAway = positiveNumber(attributes.dap_price)
  if (driveAway) return { amount: driveAway, type: 'DRIVE_AWAY_PRICE' as const }
  const estimatedDriveAway = positiveNumber(attributes.estimated_drive_away_price)
  if (
    listingCondition === 'NEW'
    && estimatedDriveAway
  ) return { amount: estimatedDriveAway, type: 'ESTIMATED_DRIVE_AWAY_PRICE' as const }
  const governedCatalogPrice = positiveNumber(catalogPrice)
  if (
    listingCondition === 'NEW'
    && config.newVehiclePriceSource === 'CATALOG_PRICE_DRIVE_AWAY'
    && governedCatalogPrice
  ) return { amount: governedCatalogPrice, type: 'DRIVE_AWAY_PRICE' as const }
  const excludingGovernmentCharges = positiveNumber(attributes.egc_price)
  if (
    listingCondition === 'USED'
    && excludingGovernmentCharges
  ) return {
    amount: excludingGovernmentCharges,
    type: 'EXCLUDING_GOVERNMENT_CHARGES_PRICE' as const
  }
  throw new GoogleMerchantVehicleCatalogError('MERCHANT_VEHICLE_PRODUCT_INCOMPLETE')
}

function linkTemplate(productUrl: string): string {
  const url = new URL(productUrl)
  url.searchParams.set('store', '__XEROFLOW_STORE_CODE__')
  return url.toString().replace('__XEROFLOW_STORE_CODE__', '{store_code}')
}

export function buildGoogleMerchantVehicleProductInput(
  product: GoogleMerchantVehicleProduct,
  config: GoogleMerchantVehicleConfig
): GoogleMerchantVehicleProductInput {
  assertConfig(config)
  const attributes = product.attributes || {}
  if (
    text(attributes.sale_status, 40).toLowerCase() !== 'for sale'
    || text(product.availability, 40).toLowerCase() !== 'available'
  ) throw new GoogleMerchantVehicleCatalogError('MERCHANT_VEHICLE_PRODUCT_INELIGIBLE')

  const listingCondition = condition(attributes)
  const offerId = text(attributes.merchant_offer_id, 150)
  const brand = text(attributes.make, 70)
  const model = text(attributes.model, 150)
  const color = text(attributes.color, 100)
  const vin = text(attributes.vin, 40)
  const vehicleYear = year(attributes)
  const mileageValue = nonNegativeNumber(attributes.odometer_reading)
  const currencyCode = text(product.currency, 3).toUpperCase()
  const productUrl = text(product.productUrl, 2000)
  const imageLink = text(product.primaryImageUrl, 2000)
  const productName = text(product.name, 150)
  if (
    !listingCondition || !offerId || !brand || !model || !color
    || !/^[A-HJ-NPR-Z0-9]{17}$/i.test(vin)
    || !vehicleYear || mileageValue === null || currencyCode !== 'AUD'
    || !productName || !productUrl.startsWith('https://') || !imageLink.startsWith('https://')
  ) throw new GoogleMerchantVehicleCatalogError('MERCHANT_VEHICLE_PRODUCT_INCOMPLETE')

  const pricing = price(product.price, attributes, listingCondition, config)
  const trim = text(attributes.series || attributes.trim || attributes.badge, 150)
  const normalizedBodyStyle = bodyStyle(attributes.body_style)
  const mileageUnit = text(attributes.odometer_unit, 20).toUpperCase() === 'MILES' ? 'MILES' : 'KM'
  return {
    offerId,
    contentLanguage: config.contentLanguage,
    feedLabel: config.feedLabel,
    legacyLocal: true,
    productAttributes: {
      title: productName,
      description: text(attributes.description, 5000) || productName,
      link: productUrl,
      imageLink,
      availability: 'IN_STOCK',
      price: {
        amountMicros: String(Math.round(pricing.amount * 1_000_000)),
        currencyCode
      },
      condition: listingCondition,
      brand,
      color,
      googleProductCategory: '916',
      includedDestinations: ['VEHICLE_ADS'],
      vin,
      model,
      ...(trim ? { trim } : {}),
      ...(normalizedBodyStyle ? { bodyStyle: normalizedBodyStyle } : {}),
      year: vehicleYear,
      mileage: { value: String(Math.round(mileageValue)), unit: mileageUnit },
      vehiclePriceType: pricing.type
    },
    customAttributes: [{
      name: 'vehicle_fulfillment',
      groupValues: [
        { name: 'option', value: 'in_store' },
        { name: 'store_code', value: config.storeCode }
      ]
    }, {
      name: 'link_template',
      value: linkTemplate(productUrl)
    }]
  }
}

export function planGoogleMerchantVehicleReconciliation(input: {
  products: GoogleMerchantVehicleProduct[]
  publications: GoogleMerchantVehiclePublication[]
  config: GoogleMerchantVehicleConfig
}): GoogleMerchantVehicleReconciliationPlan {
  const candidates: Array<{
    product: GoogleMerchantVehicleProduct
    productInput: GoogleMerchantVehicleProductInput
    vin: string
  }> = []
  const excluded: GoogleMerchantVehicleReconciliationPlan['excluded'] = []
  for (const product of input.products) {
    try {
      const productInput = buildGoogleMerchantVehicleProductInput(product, input.config)
      candidates.push({
        product,
        productInput,
        vin: productInput.productAttributes.vin.toUpperCase()
      })
    } catch (error) {
      const code = error instanceof GoogleMerchantVehicleCatalogError ? error.code : ''
      excluded.push({
        productId: product.id,
        offerId: text(product.attributes?.merchant_offer_id, 150),
        reason: code === 'MERCHANT_VEHICLE_PRODUCT_INELIGIBLE' ? 'INELIGIBLE' : 'INCOMPLETE'
      })
    }
  }

  const vinCounts = new Map<string, number>()
  const offerIdCounts = new Map<string, number>()
  for (const candidate of candidates) {
    vinCounts.set(candidate.vin, (vinCounts.get(candidate.vin) || 0) + 1)
    offerIdCounts.set(
      candidate.productInput.offerId.toUpperCase(),
      (offerIdCounts.get(candidate.productInput.offerId.toUpperCase()) || 0) + 1
    )
  }
  const publish: GoogleMerchantVehicleReconciliationPlan['publish'] = []
  for (const candidate of candidates) {
    if (vinCounts.get(candidate.vin) !== 1) {
      excluded.push({
        productId: candidate.product.id,
        offerId: candidate.productInput.offerId,
        reason: 'DUPLICATE_VIN'
      })
      continue
    }
    if (offerIdCounts.get(candidate.productInput.offerId.toUpperCase()) !== 1) {
      excluded.push({
        productId: candidate.product.id,
        offerId: candidate.productInput.offerId,
        reason: 'DUPLICATE_OFFER_ID'
      })
      continue
    }
    publish.push({
      productId: candidate.product.id,
      offerId: candidate.productInput.offerId,
      productInput: candidate.productInput
    })
  }

  const publishIds = new Set(publish.map(item => item.productId))
  const deleteItems = input.publications
    .filter(item => item.state !== 'DELETED' && !publishIds.has(item.productId))
    .map(item => ({ productId: item.productId, offerId: item.offerId }))
  return {
    publish: publish.sort((a, b) => a.offerId.localeCompare(b.offerId)),
    delete: deleteItems.sort((a, b) => a.offerId.localeCompare(b.offerId)),
    excluded: excluded.sort((a, b) => a.productId.localeCompare(b.productId))
  }
}

export function googleMerchantProductInputResourceId(input: {
  contentLanguage: string
  feedLabel: string
  offerId: string
}): string {
  return Buffer.from(
    `local~${input.contentLanguage}~${input.feedLabel}~${input.offerId}`,
    'utf8'
  ).toString('base64url')
}

async function parsedResponse(response: Response): Promise<unknown> {
  if (!response.ok) {
    throw await merchantRequestError(response)
  }
  try {
    return await response.json()
  } catch {
    throw new GoogleMerchantVehicleCatalogError('MERCHANT_VEHICLE_RESPONSE_INVALID')
  }
}

function dataSourceResult(value: unknown) {
  const parsed = DataSourceSchema.safeParse(value)
  if (!parsed.success) throw new GoogleMerchantVehicleCatalogError('MERCHANT_VEHICLE_RESPONSE_INVALID')
  const inputType = parsed.data.input === 'FILE' || parsed.data.fileInput
    ? 'FILE' as const
    : parsed.data.input === 'UI' || parsed.data.input === 'AUTOFEED'
      ? parsed.data.input
      : 'API' as const
  return {
    ...parsed.data,
    inputType,
    writableByApi: inputType === 'API'
      && parsed.data.primaryProductDataSource?.legacyLocal === true
  }
}

export function createGoogleMerchantVehicleClient(input: {
  accessToken: string
  fetch?: typeof globalThis.fetch
}) {
  if (!input.accessToken) throw new GoogleMerchantVehicleCatalogError('MERCHANT_VEHICLE_CONFIG_INVALID')
  const fetcher = input.fetch || globalThis.fetch
  const request = (url: string, init: RequestInit = {}) => fetcher(url, {
    ...init,
    headers: {
      authorization: `Bearer ${input.accessToken}`,
      ...(init.body ? { 'content-type': 'application/json' } : {}),
      ...init.headers
    }
  })
  return {
    async inspectAuthorization(args: { developerEmail: string }) {
      const response = await fetcher('https://oauth2.googleapis.com/tokeninfo', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ access_token: input.accessToken }).toString()
      })
      if (!response.ok) return {
        tokenValid: false, contentScopeGranted: false, developerEmailMatches: false
      }
      const value = await response.json().catch(() => null)
      const info = value && typeof value === 'object' && !Array.isArray(value)
        ? value as Record<string, unknown>
        : null
      const scopes = typeof info?.scope === 'string' ? info.scope.split(/\s+/) : []
      const email = typeof info?.email === 'string' ? info.email.toLowerCase() : ''
      return {
        tokenValid: true,
        contentScopeGranted: scopes.includes('https://www.googleapis.com/auth/content'),
        developerEmailMatches: email === args.developerEmail.toLowerCase()
      }
    },

    async listProducts(merchantAccountId: string): Promise<GoogleMerchantVehicleProcessedProduct[]> {
      if (!ACCOUNT_ID.test(merchantAccountId)) {
        throw new GoogleMerchantVehicleCatalogError('MERCHANT_VEHICLE_CONFIG_INVALID')
      }
      const products: GoogleMerchantVehicleProcessedProduct[] = []
      let pageToken = ''
      for (let page = 0; page < 100; page += 1) {
        const params = new URLSearchParams({ pageSize: '1000' })
        if (pageToken) params.set('pageToken', pageToken)
        const response = await request(
          `${MERCHANT_API_ROOT}/products/v1/accounts/${merchantAccountId}/products?${params}`
        )
        const parsed = ProcessedProductListSchema.safeParse(await parsedResponse(response))
        if (!parsed.success) {
          throw new GoogleMerchantVehicleCatalogError('MERCHANT_VEHICLE_RESPONSE_INVALID')
        }
        products.push(...(parsed.data.products || []) as GoogleMerchantVehicleProcessedProduct[])
        pageToken = parsed.data.nextPageToken || ''
        if (!pageToken) return products
      }
      throw new GoogleMerchantVehicleCatalogError('MERCHANT_VEHICLE_RESPONSE_INVALID')
    },

    async listDataSources(merchantAccountId: string) {
      if (!ACCOUNT_ID.test(merchantAccountId)) {
        throw new GoogleMerchantVehicleCatalogError('MERCHANT_VEHICLE_CONFIG_INVALID')
      }
      const sources: ReturnType<typeof dataSourceResult>[] = []
      let pageToken = ''
      for (let page = 0; page < 100; page += 1) {
        const params = new URLSearchParams({ pageSize: '1000' })
        if (pageToken) params.set('pageToken', pageToken)
        const response = await request(
          `${MERCHANT_API_ROOT}/datasources/v1/accounts/${merchantAccountId}/dataSources?${params}`
        )
        const parsed = DataSourceListSchema.safeParse(await parsedResponse(response))
        if (!parsed.success) {
          throw new GoogleMerchantVehicleCatalogError('MERCHANT_VEHICLE_RESPONSE_INVALID')
        }
        sources.push(...(parsed.data.dataSources || []).map(dataSourceResult))
        pageToken = parsed.data.nextPageToken || ''
        if (!pageToken) return sources
      }
      throw new GoogleMerchantVehicleCatalogError('MERCHANT_VEHICLE_RESPONSE_INVALID')
    },

    async getDataSource(name: string) {
      if (!DATA_SOURCE_NAME.test(name)) throw new GoogleMerchantVehicleCatalogError('MERCHANT_VEHICLE_CONFIG_INVALID')
      const response = await request(`${MERCHANT_API_ROOT}/datasources/v1/${name}`)
      return dataSourceResult(await parsedResponse(response))
    },

    async createVehicleDataSource(source: {
      merchantAccountId: string
      displayName: string
      feedLabel: string
      contentLanguage: string
    }) {
      if (
        !ACCOUNT_ID.test(source.merchantAccountId)
        || !text(source.displayName, 160)
        || !/^[A-Z0-9_-]{1,20}$/.test(source.feedLabel)
        || !/^[a-z]{2}$/.test(source.contentLanguage)
      ) throw new GoogleMerchantVehicleCatalogError('MERCHANT_VEHICLE_CONFIG_INVALID')
      const body = {
        displayName: text(source.displayName, 160),
        primaryProductDataSource: {
          legacyLocal: true,
          feedLabel: source.feedLabel,
          contentLanguage: source.contentLanguage,
          countries: ['AU'],
          destinations: [{ destination: 'VEHICLE_ADS', state: 'ENABLED' }]
        }
      }
      const response = await request(
        `${MERCHANT_API_ROOT}/datasources/v1/accounts/${source.merchantAccountId}/dataSources`,
        { method: 'POST', body: JSON.stringify(body) }
      )
      return dataSourceResult(await parsedResponse(response))
    },

    async registerDeveloper(args: {
      merchantAccountId: string
      developerEmail: string
    }) {
      if (
        !ACCOUNT_ID.test(args.merchantAccountId)
        || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(args.developerEmail)
        || args.developerEmail.length > 254
      ) throw new GoogleMerchantVehicleCatalogError('MERCHANT_VEHICLE_CONFIG_INVALID')
      const response = await request(
        `${MERCHANT_API_ROOT}/accounts/v1/accounts/${args.merchantAccountId}/developerRegistration:registerGcp`,
        {
          method: 'POST',
          body: JSON.stringify({ developerEmail: args.developerEmail })
        }
      )
      if (!response.ok) {
        throw await merchantRequestError(response)
      }
      return { requestId: merchantRequestId(response) }
    },

    async insertProduct(args: {
      merchantAccountId: string
      dataSource: string
      productInput: GoogleMerchantVehicleProductInput
    }) {
      if (!ACCOUNT_ID.test(args.merchantAccountId) || !DATA_SOURCE_NAME.test(args.dataSource)) {
        throw new GoogleMerchantVehicleCatalogError('MERCHANT_VEHICLE_CONFIG_INVALID')
      }
      const params = new URLSearchParams({ dataSource: args.dataSource })
      const response = await request(
        `${MERCHANT_API_ROOT}/products/v1/accounts/${args.merchantAccountId}/productInputs:insert?${params}`,
        { method: 'POST', body: JSON.stringify(args.productInput) }
      )
      const parsed = ProductInputResponseSchema.safeParse(await parsedResponse(response))
      if (!parsed.success) throw new GoogleMerchantVehicleCatalogError('MERCHANT_VEHICLE_RESPONSE_INVALID')
      return { ...parsed.data, requestId: merchantRequestId(response) }
    },

    async deleteProduct(args: {
      merchantAccountId: string
      dataSource: string
      contentLanguage: string
      feedLabel: string
      offerId: string
    }) {
      if (!ACCOUNT_ID.test(args.merchantAccountId) || !DATA_SOURCE_NAME.test(args.dataSource)) {
        throw new GoogleMerchantVehicleCatalogError('MERCHANT_VEHICLE_CONFIG_INVALID')
      }
      const productId = googleMerchantProductInputResourceId(args)
      const params = new URLSearchParams({ dataSource: args.dataSource })
      const response = await request(
        `${MERCHANT_API_ROOT}/products/v1/accounts/${args.merchantAccountId}/productInputs/${productId}?${params}`,
        { method: 'DELETE' }
      )
      if (!response.ok) {
        throw await merchantRequestError(response)
      }
      return { requestId: merchantRequestId(response) }
    }
  }
}
