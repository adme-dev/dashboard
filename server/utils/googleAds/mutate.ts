import {
  googleAdsRequest,
  type GoogleAdsAuth,
  type GoogleAdsRequestOptions
} from '~~/server/utils/googleAds/api'

export const GOOGLE_ADS_MUTATION_SERVICES = [
  'googleAds',
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
  'customConversionGoals',
  'conversionGoalCampaignConfigs',
  'biddingStrategies',
  'audiences',
  'customAudiences',
  'recommendationsApply',
  'recommendationsDismiss'
] as const

export type GoogleAdsServiceName = typeof GOOGLE_ADS_MUTATION_SERVICES[number]

type GoogleAdsResource = Record<string, unknown>

export type GoogleAdsOperation
  = | { create: GoogleAdsResource, update?: never, updateMask?: never, remove?: never }
    | { create?: never, update: GoogleAdsResource, updateMask: string, remove?: never }
    | { create?: never, update?: never, updateMask?: never, remove: string }
    | { create?: never, update?: never, updateMask?: never, remove?: never, mutate: GoogleAdsResource }
    | { create?: never, update?: never, updateMask?: never, remove?: never, mutate?: never, recommendation: GoogleAdsResource }

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
    options: GoogleAdsRequestOptions<Record<string, unknown>>
  ) => Promise<{ data: unknown, requestId?: string }>
}

const SERVICE_SET = new Set<string>(GOOGLE_ADS_MUTATION_SERVICES)
const OPERATION_KEYS = new Set(['create', 'update', 'updateMask', 'remove', 'mutate', 'recommendation'])

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
  const hasMutate = Object.hasOwn(value, 'mutate')
  const hasRecommendation = Object.hasOwn(value, 'recommendation')
  if (Number(hasCreate) + Number(hasUpdate) + Number(hasRemove) + Number(hasMutate) + Number(hasRecommendation) !== 1) return false

  if (hasCreate) {
    return isResource(value.create) && !Object.hasOwn(value, 'updateMask')
  }
  if (hasUpdate) {
    return isResource(value.update)
      && typeof value.updateMask === 'string'
      && value.updateMask.trim().length > 0
  }
  if (hasMutate) return isResource(value.mutate) && !Object.hasOwn(value, 'updateMask')
  if (hasRecommendation) return isResource(value.recommendation) && !Object.hasOwn(value, 'updateMask')
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
  requestId?: string
): GoogleAdsMutateResult {
  if (!isResource(data)) throw new Error('Invalid Google Ads mutation response')
  const results = data.results === undefined
    ? data.mutateOperationResponses === undefined ? [] : data.mutateOperationResponses
    : data.results
  if (!Array.isArray(results)) throw new Error('Invalid Google Ads mutation response')

  return {
    results,
    partialFailureError: data.partialFailureError,
    requestId
  }
}

const defaultDeps: GoogleAdsMutateDeps = {
  request: options => googleAdsRequest(options)
}

export async function mutateGoogleAds(
  input: MutateGoogleAdsInput,
  deps: Partial<GoogleAdsMutateDeps> = {}
): Promise<GoogleAdsMutateResult> {
  const customerId = cleanCustomerId(input.customerId)
  if (!SERVICE_SET.has(input.service)) {
    throw new Error('Unsupported Google Ads mutation service')
  }
  validateOperations(input.operations)

  const bulkMutate = input.service === 'googleAds'
  const recommendationMutation = input.service === 'recommendationsApply'
    || input.service === 'recommendationsDismiss'
  const hasBulkEnvelopes = input.operations.some(operation => 'mutate' in operation)
  const hasRecommendationEnvelopes = input.operations.some(operation => 'recommendation' in operation)
  if (bulkMutate !== hasBulkEnvelopes
    || recommendationMutation !== hasRecommendationEnvelopes
    || (bulkMutate && input.operations.some(operation => !('mutate' in operation)))
    || (recommendationMutation && input.operations.some(operation => !('recommendation' in operation)))) {
    throw new Error('Invalid Google Ads mutation operations')
  }

  const partialFailure = input.partialFailure ?? false
  if (partialFailure && input.atomicity !== 'independent') {
    throw new Error('Partial failure is only allowed for independent operations')
  }

  if (recommendationMutation && input.validateOnly) return { results: [] }

  const request = deps.request ?? defaultDeps.request
  let operationBody: Record<string, unknown>
  if (recommendationMutation) {
    operationBody = {
      operations: input.operations.map((operation) => {
        if ('recommendation' in operation) return operation.recommendation
        throw new Error('Invalid Google Ads recommendation operation')
      })
    }
  } else if (bulkMutate) {
    operationBody = {
      mutateOperations: input.operations.map((operation) => {
        if ('mutate' in operation) return operation.mutate
        throw new Error('Invalid Google Ads bulk mutation operation')
      })
    }
  } else {
    operationBody = { operations: input.operations }
  }
  const validationBody = recommendationMutation
    ? {}
    : {
        validateOnly: input.validateOnly,
        responseContentType: 'MUTABLE_RESOURCE'
      }
  const response = await request({
    path: recommendationMutation
      ? `/customers/${customerId}/recommendations:${input.service === 'recommendationsApply' ? 'apply' : 'dismiss'}`
      : `/customers/${customerId}/${input.service}:mutate`,
    method: 'POST',
    auth: input.auth,
    body: {
      ...operationBody,
      partialFailure,
      ...validationBody
    },
    retries: 0,
    write: true
  })

  return normalizeMutationResponse(response.data, response.requestId)
}
