import { z } from 'zod'
import { hashCanonicalLaunchJson } from '~~/server/utils/googlePmaxLaunchHash'

const SourceConditionSchema = z.enum(['NEW', 'DEMO', 'USED'])
const GoogleConditionSchema = z.enum(['NEW', 'USED'])
const DigitIdSchema = z.string().regex(/^\d+$/)
const NonEmptyStringSchema = z.string().trim().min(1).max(255)

const DeploymentContractInputSchema = z.strictObject({
  schemaVersion: z.literal(1),
  tenantId: z.string().uuid(),
  clientId: z.string().uuid(),
  legalAdvertiserName: NonEmptyStringSchema,
  source: z.strictObject({
    connectorId: z.string().uuid(),
    kind: z.literal('SUPABASE'),
    sellerIds: z.array(NonEmptyStringSchema).min(1).max(100),
    requiredSaleStatus: z.literal('For Sale')
  }),
  merchant: z.strictObject({
    accountId: DigitIdSchema,
    dataSourceId: DigitIdSchema,
    feedLabel: NonEmptyStringSchema,
    targetCountry: z.literal('AU'),
    contentLanguage: z.literal('en'),
    storeCodeMode: z.enum(['ACCOUNT_WIDE', 'EXPLICIT']),
    storeCodes: z.array(NonEmptyStringSchema).max(100)
  }),
  ads: z.strictObject({
    connectionId: z.string().uuid(),
    customerId: DigitIdSchema,
    campaignId: DigitIdSchema,
    assetGroupIds: z.array(DigitIdSchema).min(1).max(100)
  }),
  campaign: z.strictObject({
    objective: z.literal('VEHICLE_SALES'),
    sourceConditions: z.array(SourceConditionSchema).min(1).max(3),
    googleConditions: z.array(GoogleConditionSchema).max(2).optional(),
    excludedMakes: z.array(NonEmptyStringSchema).max(100),
    excludedModels: z.array(NonEmptyStringSchema).max(500)
  }),
  measurement: z.strictObject({
    trackingSiteId: z.string().uuid(),
    domains: z.array(NonEmptyStringSchema).min(1).max(100)
  })
})

const GooglePmaxProductIdentityInputSchema = z.strictObject({
  clientId: z.string().uuid(),
  connectorId: z.string().uuid(),
  sourceProductId: NonEmptyStringSchema,
  stockId: NonEmptyStringSchema,
  vin: NonEmptyStringSchema,
  merchantOfferId: NonEmptyStringSchema,
  feedLabel: NonEmptyStringSchema,
  sellerId: NonEmptyStringSchema,
  saleStatus: NonEmptyStringSchema,
  sourceCondition: SourceConditionSchema
})

export type GooglePmaxSourceCondition = z.infer<typeof SourceConditionSchema>
export type GooglePmaxGoogleCondition = 'NEW' | 'USED'

export interface GooglePmaxDeploymentContract {
  schemaVersion: 1
  tenantId: string
  clientId: string
  legalAdvertiserName: string
  source: {
    connectorId: string
    kind: 'SUPABASE'
    sellerIds: string[]
    requiredSaleStatus: 'For Sale'
  }
  merchant: {
    accountId: string
    dataSourceId: string
    feedLabel: string
    targetCountry: 'AU'
    contentLanguage: 'en'
    storeCodeMode: 'ACCOUNT_WIDE' | 'EXPLICIT'
    storeCodes: string[]
  }
  ads: {
    connectionId: string
    customerId: string
    campaignId: string
    assetGroupIds: string[]
  }
  campaign: {
    objective: 'VEHICLE_SALES'
    sourceConditions: GooglePmaxSourceCondition[]
    googleConditions: GooglePmaxGoogleCondition[]
    excludedMakes: string[]
    excludedModels: string[]
  }
  measurement: {
    trackingSiteId: string
    domains: string[]
  }
}

export interface GooglePmaxProductIdentityInput {
  clientId: string
  connectorId: string
  sourceProductId: string
  stockId: string
  vin: string
  merchantOfferId: string
  feedLabel: string
  sellerId: string
  saleStatus: string
  sourceCondition: GooglePmaxSourceCondition
}

export interface GooglePmaxProductIdentityEvaluation extends GooglePmaxProductIdentityInput {
  googleCondition: GooglePmaxGoogleCondition
  customLabel0: 'new' | 'demo' | 'used'
  eligible: boolean
  exclusionReason: 'NOT_FOR_SALE' | 'CONDITION_NOT_SELECTED' | null
}

export type GooglePmaxDeploymentContractErrorCode
  = | 'DEPLOYMENT_CONTRACT_INVALID'
    | 'DEPLOYMENT_DOMAIN_INVALID'
    | 'DEPLOYMENT_STORE_CODE_INVALID'
    | 'PRODUCT_IDENTITY_INVALID'
    | 'PRODUCT_CLIENT_MISMATCH'
    | 'PRODUCT_CONNECTOR_MISMATCH'
    | 'PRODUCT_FEED_LABEL_MISMATCH'
    | 'PRODUCT_SELLER_MISMATCH'
    | 'PRODUCT_SOURCE_ID_DUPLICATE'
    | 'PRODUCT_STOCK_ID_DUPLICATE'
    | 'PRODUCT_VIN_DUPLICATE'
    | 'PRODUCT_OFFER_ID_DUPLICATE'

export class GooglePmaxDeploymentContractError extends Error {
  constructor(public readonly code: GooglePmaxDeploymentContractErrorCode, message: string) {
    super(message)
    this.name = 'GooglePmaxDeploymentContractError'
  }
}

function lexicalCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function uniqueSorted(values: string[], transform: (value: string) => string = value => value.trim()): string[] {
  return [...new Set(values.map(transform).filter(Boolean))].sort(lexicalCompare)
}

function normalizeUuid(value: string): string {
  return value.toLowerCase()
}

function normalizeDomain(value: string): string {
  const candidate = value.trim()
  let url: URL
  try {
    url = new URL(candidate.includes('://') ? candidate : `https://${candidate}`)
  } catch {
    throw new GooglePmaxDeploymentContractError(
      'DEPLOYMENT_DOMAIN_INVALID',
      'Campaign domains must be valid public hostnames.'
    )
  }
  const hostname = url.hostname.toLowerCase().replace(/\.$/, '')
  if (
    url.protocol !== 'https:'
    || url.username
    || url.password
    || url.port
    || (url.pathname !== '/' && url.pathname !== '')
    || url.search
    || url.hash
    || hostname === 'localhost'
    || !hostname.includes('.')
  ) {
    throw new GooglePmaxDeploymentContractError(
      'DEPLOYMENT_DOMAIN_INVALID',
      'Campaign domains must be bare public HTTPS hostnames without credentials, ports, paths or query strings.'
    )
  }
  return hostname
}

function normalizeSourceConditions(values: GooglePmaxSourceCondition[]): GooglePmaxSourceCondition[] {
  const order: GooglePmaxSourceCondition[] = ['NEW', 'DEMO', 'USED']
  const selected = new Set(values)
  return order.filter(value => selected.has(value))
}

function googleConditionFor(sourceCondition: GooglePmaxSourceCondition): GooglePmaxGoogleCondition {
  return sourceCondition === 'NEW' ? 'NEW' : 'USED'
}

function customLabelFor(sourceCondition: GooglePmaxSourceCondition): 'new' | 'demo' | 'used' {
  return sourceCondition.toLowerCase() as 'new' | 'demo' | 'used'
}

export function normalizeGooglePmaxDeploymentContract(input: unknown): {
  contract: GooglePmaxDeploymentContract
  contractHash: string
} {
  const parsed = DeploymentContractInputSchema.safeParse(input)
  if (!parsed.success) {
    throw new GooglePmaxDeploymentContractError(
      'DEPLOYMENT_CONTRACT_INVALID',
      'Google PMax deployment contract failed strict validation.'
    )
  }

  const sourceConditions = normalizeSourceConditions(parsed.data.campaign.sourceConditions)
  const googleConditions = [...new Set(sourceConditions.map(googleConditionFor))]
    .sort(lexicalCompare) as GooglePmaxGoogleCondition[]
  const storeCodes = uniqueSorted(parsed.data.merchant.storeCodes)
  if (
    (parsed.data.merchant.storeCodeMode === 'ACCOUNT_WIDE' && storeCodes.length > 0)
    || (parsed.data.merchant.storeCodeMode === 'EXPLICIT' && storeCodes.length === 0)
  ) {
    throw new GooglePmaxDeploymentContractError(
      'DEPLOYMENT_STORE_CODE_INVALID',
      'Store-code mode and the exact store-code list do not agree.'
    )
  }

  const contract: GooglePmaxDeploymentContract = {
    schemaVersion: 1,
    tenantId: normalizeUuid(parsed.data.tenantId),
    clientId: normalizeUuid(parsed.data.clientId),
    legalAdvertiserName: parsed.data.legalAdvertiserName.trim(),
    source: {
      connectorId: normalizeUuid(parsed.data.source.connectorId),
      kind: 'SUPABASE',
      sellerIds: uniqueSorted(parsed.data.source.sellerIds, value => value.trim().toLowerCase()),
      requiredSaleStatus: 'For Sale'
    },
    merchant: {
      accountId: parsed.data.merchant.accountId,
      dataSourceId: parsed.data.merchant.dataSourceId,
      feedLabel: parsed.data.merchant.feedLabel.trim(),
      targetCountry: 'AU',
      contentLanguage: 'en',
      storeCodeMode: parsed.data.merchant.storeCodeMode,
      storeCodes
    },
    ads: {
      connectionId: normalizeUuid(parsed.data.ads.connectionId),
      customerId: parsed.data.ads.customerId,
      campaignId: parsed.data.ads.campaignId,
      assetGroupIds: uniqueSorted(parsed.data.ads.assetGroupIds)
    },
    campaign: {
      objective: 'VEHICLE_SALES',
      sourceConditions,
      googleConditions,
      excludedMakes: uniqueSorted(parsed.data.campaign.excludedMakes, value => value.trim().toLowerCase()),
      excludedModels: uniqueSorted(parsed.data.campaign.excludedModels, value => value.trim().toLowerCase())
    },
    measurement: {
      trackingSiteId: normalizeUuid(parsed.data.measurement.trackingSiteId),
      domains: uniqueSorted(parsed.data.measurement.domains, normalizeDomain)
    }
  }
  return { contract, contractHash: hashCanonicalLaunchJson(contract) }
}

function assertUnique(
  seen: Map<string, number>,
  value: string,
  index: number,
  code: GooglePmaxDeploymentContractErrorCode,
  label: string
): void {
  const key = value.trim().toLowerCase()
  const priorIndex = seen.get(key)
  if (priorIndex !== undefined) {
    throw new GooglePmaxDeploymentContractError(
      code,
      `${label} is duplicated between product rows ${priorIndex + 1} and ${index + 1}.`
    )
  }
  seen.set(key, index)
}

export function evaluateGooglePmaxProductIdentities(
  contract: GooglePmaxDeploymentContract,
  input: readonly GooglePmaxProductIdentityInput[]
): GooglePmaxProductIdentityEvaluation[] {
  const sourceIds = new Map<string, number>()
  const stockIds = new Map<string, number>()
  const vins = new Map<string, number>()
  const offerIds = new Map<string, number>()
  const sellerIds = new Set(contract.source.sellerIds)
  const selectedConditions = new Set(contract.campaign.sourceConditions)

  return input.map((rawProduct, index) => {
    const parsed = GooglePmaxProductIdentityInputSchema.safeParse(rawProduct)
    if (!parsed.success) {
      throw new GooglePmaxDeploymentContractError(
        'PRODUCT_IDENTITY_INVALID',
        `Product row ${index + 1} failed strict identity validation.`
      )
    }
    const product: GooglePmaxProductIdentityInput = {
      ...parsed.data,
      clientId: normalizeUuid(parsed.data.clientId),
      connectorId: normalizeUuid(parsed.data.connectorId),
      sourceProductId: parsed.data.sourceProductId.trim(),
      stockId: parsed.data.stockId.trim(),
      vin: parsed.data.vin.trim().toUpperCase(),
      merchantOfferId: parsed.data.merchantOfferId.trim(),
      feedLabel: parsed.data.feedLabel.trim(),
      sellerId: parsed.data.sellerId.trim().toLowerCase(),
      saleStatus: parsed.data.saleStatus.trim()
    }

    if (product.clientId !== contract.clientId) {
      throw new GooglePmaxDeploymentContractError('PRODUCT_CLIENT_MISMATCH', 'Product belongs to another client.')
    }
    if (product.connectorId !== contract.source.connectorId) {
      throw new GooglePmaxDeploymentContractError('PRODUCT_CONNECTOR_MISMATCH', 'Product belongs to another source connector.')
    }
    if (product.feedLabel !== contract.merchant.feedLabel) {
      throw new GooglePmaxDeploymentContractError('PRODUCT_FEED_LABEL_MISMATCH', 'Product belongs to another Merchant feed label.')
    }
    if (!sellerIds.has(product.sellerId)) {
      throw new GooglePmaxDeploymentContractError('PRODUCT_SELLER_MISMATCH', 'Product seller is outside the approved seller scope.')
    }

    assertUnique(sourceIds, product.sourceProductId, index, 'PRODUCT_SOURCE_ID_DUPLICATE', 'Source product ID')
    assertUnique(stockIds, product.stockId, index, 'PRODUCT_STOCK_ID_DUPLICATE', 'Stock ID')
    assertUnique(vins, product.vin, index, 'PRODUCT_VIN_DUPLICATE', 'VIN')
    assertUnique(offerIds, product.merchantOfferId, index, 'PRODUCT_OFFER_ID_DUPLICATE', 'Merchant offer ID')

    const forSale = product.saleStatus === contract.source.requiredSaleStatus
    const selected = selectedConditions.has(product.sourceCondition)
    return {
      ...product,
      googleCondition: googleConditionFor(product.sourceCondition),
      customLabel0: customLabelFor(product.sourceCondition),
      eligible: forSale && selected,
      exclusionReason: !forSale ? 'NOT_FOR_SALE' : !selected ? 'CONDITION_NOT_SELECTED' : null
    }
  })
}
