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
}

export interface GoogleMerchantVehicleProductInput {
  offerId: string
  contentLanguage: string
  feedLabel: string
  channel: 'LOCAL'
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
    vehiclePriceType: 'DRIVE_AWAY_PRICE' | 'EXCLUDING_GOVERNMENT_CHARGES_PRICE'
  }
  customAttributes: Array<{
    name: 'vehicle_fulfillment'
    groupValues: Array<{ name: 'option' | 'store_code', value: string }>
  }>
}

export class GoogleMerchantVehicleCatalogError extends Error {
  constructor(public readonly code:
    | 'MERCHANT_VEHICLE_CONFIG_INVALID'
    | 'MERCHANT_VEHICLE_PRODUCT_INELIGIBLE'
    | 'MERCHANT_VEHICLE_PRODUCT_INCOMPLETE'
    | 'MERCHANT_VEHICLE_REQUEST_FAILED'
    | 'MERCHANT_VEHICLE_RESPONSE_INVALID') {
    super(code)
    this.name = 'GoogleMerchantVehicleCatalogError'
  }
}

const DataSourceSchema = z.object({
  name: z.string().regex(DATA_SOURCE_NAME),
  displayName: z.string().optional(),
  primaryProductDataSource: z.object({
    legacyLocal: z.boolean().optional(),
    feedLabel: z.string().optional(),
    contentLanguage: z.string().optional(),
    countries: z.array(z.string()).optional(),
    destinations: z.array(z.object({
      destination: z.string(),
      status: z.string()
    }).passthrough()).optional()
  }).passthrough().optional(),
  fileInput: z.record(z.string(), z.unknown()).optional()
}).passthrough()

const ProductInputResponseSchema = z.object({
  name: z.string().min(1),
  product: z.string().min(1),
  offerId: z.string().min(1)
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
  const value = text(attributes.build_year || attributes.release_year || attributes.release_date_year, 4)
  return /^(19|20)\d{2}$/.test(value) ? value : ''
}

function condition(attributes: Record<string, unknown>): 'NEW' | 'USED' | null {
  const listingType = text(attributes.listing_type, 40).toLowerCase()
  if (listingType === 'new') return 'NEW'
  if (listingType === 'demo' || listingType === 'used') return 'USED'
  return null
}

function priceType(attributes: Record<string, unknown>, listingCondition: 'NEW' | 'USED') {
  if (positiveNumber(attributes.dap_price)) return 'DRIVE_AWAY_PRICE' as const
  if (positiveNumber(attributes.egc_price)) return 'EXCLUDING_GOVERNMENT_CHARGES_PRICE' as const
  return listingCondition === 'NEW'
    ? 'DRIVE_AWAY_PRICE' as const
    : 'EXCLUDING_GOVERNMENT_CHARGES_PRICE' as const
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
  const amount = positiveNumber(product.price)
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
    !listingCondition || !amount || !offerId || !brand || !model || !color || !vin
    || !vehicleYear || mileageValue === null || currencyCode !== 'AUD'
    || !productName || !productUrl.startsWith('https://') || !imageLink.startsWith('https://')
  ) throw new GoogleMerchantVehicleCatalogError('MERCHANT_VEHICLE_PRODUCT_INCOMPLETE')

  const trim = text(attributes.series || attributes.trim || attributes.badge, 150)
  const normalizedBodyStyle = bodyStyle(attributes.body_style)
  const mileageUnit = text(attributes.odometer_unit, 20).toUpperCase() === 'MILES' ? 'MILES' : 'KM'
  return {
    offerId,
    contentLanguage: config.contentLanguage,
    feedLabel: config.feedLabel,
    channel: 'LOCAL',
    productAttributes: {
      title: productName,
      description: text(attributes.description, 5000) || productName,
      link: productUrl,
      imageLink,
      availability: 'IN_STOCK',
      price: {
        amountMicros: String(Math.round(amount * 1_000_000)),
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
      vehiclePriceType: priceType(attributes, listingCondition)
    },
    customAttributes: [{
      name: 'vehicle_fulfillment',
      groupValues: [
        { name: 'option', value: 'in_store' },
        { name: 'store_code', value: config.storeCode }
      ]
    }]
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
  if (!response.ok) throw new GoogleMerchantVehicleCatalogError('MERCHANT_VEHICLE_REQUEST_FAILED')
  try {
    return await response.json()
  } catch {
    throw new GoogleMerchantVehicleCatalogError('MERCHANT_VEHICLE_RESPONSE_INVALID')
  }
}

function dataSourceResult(value: unknown) {
  const parsed = DataSourceSchema.safeParse(value)
  if (!parsed.success) throw new GoogleMerchantVehicleCatalogError('MERCHANT_VEHICLE_RESPONSE_INVALID')
  const inputType = parsed.data.fileInput ? 'FILE' as const : 'API' as const
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
          destinations: [{ destination: 'VEHICLE_ADS', status: 'ENABLED' }]
        }
      }
      const response = await request(
        `${MERCHANT_API_ROOT}/datasources/v1/accounts/${source.merchantAccountId}/dataSources`,
        { method: 'POST', body: JSON.stringify(body) }
      )
      return dataSourceResult(await parsedResponse(response))
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
      if (!response.ok) throw new GoogleMerchantVehicleCatalogError('MERCHANT_VEHICLE_REQUEST_FAILED')
      return { requestId: merchantRequestId(response) }
    }
  }
}
