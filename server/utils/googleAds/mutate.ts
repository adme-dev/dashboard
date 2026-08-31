import {
  googleAdsRequest,
  type GoogleAdsAuth,
  type GoogleAdsRequestOptions,
} from '~~/server/utils/googleAds/api'

export const GOOGLE_ADS_MUTATION_SERVICES = [
  'campaignBudgets',
  'campaigns',
  'adGroups',
  'adGroupAds',
  'adGroupCriteria',
  'campaignCriteria',
  'customerNegativeCriteria',
  'sharedSets',
  'sharedCriteria',
  'campaignSharedSets',
  'assets',
  'campaignAssets',
  'adGroupAssets',
  'customerAssets',
  'assetGroups',
  'assetGroupAssets',
  'assetGroupSignals',
  'assetGroupListingGroupFilters',
  'conversionActions',
  'campaignConversionGoals',
  'customerConversionGoals',
  'biddingStrategies',
  'audiences',
  'customAudiences',
] as const

export type GoogleAdsServiceName = typeof GOOGLE_ADS_MUTATION_SERVICES[number]

type GoogleAdsResource = Record<string, unknown>

export type GoogleAdsOperation =
  | { create: GoogleAdsResource, update?: never, updateMask?: never, remove?: never }
  | { create?: never, update: GoogleAdsResource, updateMask: string, remove?: never }
  | { create?: never, update?: never, updateMask?: never, remove: string }

export interface MutateGoogleAdsInput {
  customerId: string
  service: GoogleAdsServiceName
  auth: GoogleAdsAuth
  operations: GoogleAdsOperation[]
  validateOnly: boolean
  atomicity: 'independent' | 'interdependent'
  partialFailure?: boolean
}

export interface GoogleAdsMutateResult {
  results: unknown[]
  partialFailureError?: unknown
  requestId?: string
}

export interface GoogleAdsMutateDeps {
  request: (
    options: GoogleAdsRequestOptions<Record<string, unknown>>,
  ) => Promise<{ data: unknown, requestId?: string }>
}

const SERVICE_SET = new Set<string>(GOOGLE_ADS_MUTATION_SERVICES)
const OPERATION_KEYS = new Set(['create', 'update', 'updateMask', 'remove'])

function cleanCustomerId(value: string): string {
  const cleaned = value.replace(/-/g, '')
  if (!/^\d{1,20}$/.test(cleaned)) {
    throw new Error('Invalid Google Ads customer ID')
  }
  return cleaned
}

function isResource(value: unknown): value is GoogleAdsResource {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isValidOperation(value: unknown): value is GoogleAdsOperation {
  if (!isResource(value)) return false
  if (Object.keys(value).some(key => !OPERATION_KEYS.has(key))) return false

  const hasCreate = Object.hasOwn(value, 'create')
  const hasUpdate = Object.hasOwn(value, 'update')
  const hasRemove = Object.hasOwn(value, 'remove')
  if (Number(hasCreate) + Number(hasUpdate) + Number(hasRemove) !== 1) return false

  if (hasCreate) {
    return isResource(value.create) && !Object.hasOwn(value, 'updateMask')
  }
  if (hasUpdate) {
    return isResource(value.update)
      && typeof value.updateMask === 'string'
      && value.updateMask.trim().length > 0
  }
  return typeof value.remove === 'string'
    && value.remove.trim().length > 0
    && !Object.hasOwn(value, 'updateMask')
}

function validateOperations(operations: unknown): asserts operations is GoogleAdsOperation[] {
  if (!Array.isArray(operations)
    || operations.length === 0
    || operations.length > 1_000
    || operations.some(operation => !isValidOperation(operation))) {
    throw new Error('Invalid Google Ads mutation operations')
  }
}

function normalizeMutationResponse(
  data: unknown,
  requestId?: string,
): GoogleAdsMutateResult {
  if (!isResource(data)) throw new Error('Invalid Google Ads mutation response')
  const results = data.results === undefined ? [] : data.results
  if (!Array.isArray(results)) throw new Error('Invalid Google Ads mutation response')

  return {
    results,
    partialFailureError: data.partialFailureError,
    requestId,
  }
}

const defaultDeps: GoogleAdsMutateDeps = {
  request: options => googleAdsRequest(options),
}

export async function mutateGoogleAds(
  input: MutateGoogleAdsInput,
  deps: Partial<GoogleAdsMutateDeps> = {},
): Promise<GoogleAdsMutateResult> {
  const customerId = cleanCustomerId(input.customerId)
  if (!SERVICE_SET.has(input.service)) {
    throw new Error('Unsupported Google Ads mutation service')
  }
  validateOperations(input.operations)

  const partialFailure = input.partialFailure ?? false
  if (partialFailure && input.atomicity !== 'independent') {
    throw new Error('Partial failure is only allowed for independent operations')
  }

  const request = deps.request ?? defaultDeps.request
  const response = await request({
    path: `/customers/${customerId}/${input.service}:mutate`,
    method: 'POST',
    auth: input.auth,
    body: {
      operations: input.operations,
      partialFailure,
      validateOnly: input.validateOnly,
      responseContentType: 'MUTABLE_RESOURCE',
    },
    retries: 0,
    write: true,
  })

  return normalizeMutationResponse(response.data, response.requestId)
}
