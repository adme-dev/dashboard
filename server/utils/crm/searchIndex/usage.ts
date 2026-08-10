import {
  CRM_SEARCH_MAX_INPUT_TOKENS,
  CRM_SEARCH_MODEL_ID,
  CRM_SEARCH_VECTOR_DIMENSIONS,
  type CrmSearchRateCardArithmetic
} from './contracts'

// A forecast that reaches 80% is blocked; only a value strictly below passes.
export const CRM_SEARCH_CAPACITY_ADMISSION_PERCENT = 80 as const
export const CRM_SEARCH_VECTOR_TOP_K_MAXIMUM = 50 as const
export const CRM_SEARCH_VECTORIZE_MAX_NAMESPACES = 50_000 as const
export const CRM_SEARCH_VECTORIZE_MAX_VECTORS = 20_000_000 as const

const rateCardRevisionPattern = /^[a-z0-9][a-z0-9._:-]{2,119}$/
const canonicalUtcTimestampPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/

export interface VectorizeUsageInput {
  queryVectors: number
  insertedVectors: number
  storedVectors: number
  dimensions: number
  topK: number
}

export interface VectorizeDimensionUsage {
  queryDimensions: number
  insertedDimensions: number
  /** Cloudflare bills queried plus inserted vector dimensions in this meter. */
  billableQueriedDimensions: number
  storedDimensions: number
}

export interface CalculateCrmSearchProviderReservationInput extends VectorizeUsageInput {
  workersAiInvocations: number
  vectorizeQueryCalls: number
  vectorizeMutationCalls: number
  /** Server timestamp used to prove immutable rate-card validity deterministically. */
  reservationAt: string
  rateCard: CrmSearchRateCardArithmetic
}

export interface CrmSearchProviderReservation extends VectorizeDimensionUsage {
  providerCalls: number
  modelInputTokens: number
  rateCardRevision: string
  cost: {
    modelInputUsdMicros: number
    queriedDimensionUsdMicros: number
    insertedDimensionUsdMicros: number
    storedDimensionUsdMicros: number
    totalUsdMicros: number
  }
}

const usageCapKeys = [
  'providerCalls',
  'modelInputTokens',
  'queryDimensions',
  'insertedDimensions',
  'storedDimensions',
  'usdMicros'
] as const

export type CrmSearchUsageCapKey = typeof usageCapKeys[number]
export type CrmSearchUsageAmounts = Record<CrmSearchUsageCapKey, number>
export type CrmSearchUsageCaps = Record<CrmSearchUsageCapKey, number | null | undefined>

export interface CrmSearchCapacityInventoryBucket {
  namespaces: number
  vectors: number
}

export type CrmSearchCapacityInventoryKey
  = | 'active'
    | 'candidate'
    | 'retiring'
    | 'sentinel'
    | 'deletionPending'

export type CrmSearchCapacityInventory = Record<
  CrmSearchCapacityInventoryKey,
  CrmSearchCapacityInventoryBucket
>

export interface CrmSearchCapacityForecastInput {
  limits: {
    namespaces: number | null | undefined
    vectors: number | null | undefined
  }
  inventory: CrmSearchCapacityInventory
}

function requireNonNegativeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new RangeError(`${label} must be a non-negative safe integer`)
  }
  return value as number
}

function checkedAdd(values: readonly number[], label: string): number {
  const total = values.reduce((sum, value) => sum + value, 0)
  if (!Number.isSafeInteger(total)) throw new RangeError(`${label} exceeds safe integer arithmetic`)
  return total
}

function checkedMultiply(left: number, right: number, label: string): number {
  const result = left * right
  if (!Number.isSafeInteger(result)) throw new RangeError(`${label} exceeds safe integer arithmetic`)
  return result
}

function requirePinnedVectorContract(input: VectorizeUsageInput): void {
  requireNonNegativeInteger(input.queryVectors, 'Query vector count')
  requireNonNegativeInteger(input.insertedVectors, 'Inserted vector count')
  requireNonNegativeInteger(input.storedVectors, 'Stored vector count')
  if (input.dimensions !== CRM_SEARCH_VECTOR_DIMENSIONS) {
    throw new RangeError(`CRM search vectors must have ${CRM_SEARCH_VECTOR_DIMENSIONS} dimensions`)
  }
  if (!Number.isInteger(input.topK)
    || input.topK < 1
    || input.topK > CRM_SEARCH_VECTOR_TOP_K_MAXIMUM) {
    throw new RangeError(`CRM search topK must be between 1 and ${CRM_SEARCH_VECTOR_TOP_K_MAXIMUM}`)
  }
}

/**
 * Cloudflare's current formula meters queried and inserted vectors by vector
 * count × dimensions; topK is deliberately absent from the arithmetic.
 * Source: https://developers.cloudflare.com/workers/platform/pricing/#vectorize
 */
export function vectorizeUsage(input: VectorizeUsageInput): VectorizeDimensionUsage {
  requirePinnedVectorContract(input)
  const queryDimensions = checkedMultiply(
    input.queryVectors,
    input.dimensions,
    'Query dimensions'
  )
  const insertedDimensions = checkedMultiply(
    input.insertedVectors,
    input.dimensions,
    'Inserted dimensions'
  )
  const storedDimensions = checkedMultiply(
    input.storedVectors,
    input.dimensions,
    'Stored dimensions'
  )
  return {
    queryDimensions,
    insertedDimensions,
    billableQueriedDimensions: checkedAdd(
      [queryDimensions, insertedDimensions],
      'Billable queried dimensions'
    ),
    storedDimensions
  }
}

function requireRate(rate: unknown, label: string): number {
  if (!Number.isSafeInteger(rate) || (rate as number) < 0) {
    throw new RangeError(`${label} must be a non-negative safe-integer micro-USD rate`)
  }
  return rate as number
}

function ceilingMicroUsd(quantity: number, microUsdRatePerMillion: number, label: string): number {
  if (quantity === 0 || microUsdRatePerMillion === 0) return 0
  const result = (BigInt(quantity) * BigInt(microUsdRatePerMillion) + 999_999n) / 1_000_000n
  if (result > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new RangeError(`${label} exceeds safe cost arithmetic`)
  }
  return Number(result)
}

function requireCanonicalUtcTimestamp(value: unknown, label: string): number {
  if (typeof value !== 'string' || !canonicalUtcTimestampPattern.test(value)) {
    throw new TypeError(`${label} must be a canonical UTC timestamp`)
  }
  const epochMs = Date.parse(value)
  if (!Number.isFinite(epochMs) || new Date(epochMs).toISOString() !== value) {
    throw new TypeError(`${label} must be a canonical UTC timestamp`)
  }
  return epochMs
}

function requireCurrentRateCard(
  rateCard: CrmSearchRateCardArithmetic | undefined,
  reservationAt: unknown
): CrmSearchRateCardArithmetic {
  if (!rateCard || typeof rateCard !== 'object') {
    throw new Error('A proven CRM search rate card is required')
  }
  if (typeof rateCard.revision !== 'string'
    || !rateCardRevisionPattern.test(rateCard.revision)
    || rateCard.modelId !== CRM_SEARCH_MODEL_ID
    || rateCard.revokedAt !== null) {
    throw new Error('CRM search rate card evidence is invalid or revoked')
  }
  const at = requireCanonicalUtcTimestamp(reservationAt, 'Rate card reservation time')
  const validFrom = requireCanonicalUtcTimestamp(rateCard.validFrom, 'Rate card valid-from time')
  const validUntil = requireCanonicalUtcTimestamp(rateCard.validUntil, 'Rate card valid-until time')
  if (validUntil <= validFrom || at < validFrom || at >= validUntil) {
    throw new Error('CRM search rate card is not current at reservation time')
  }
  return rateCard
}

export function calculateCrmSearchProviderReservation(
  input: CalculateCrmSearchProviderReservationInput
): CrmSearchProviderReservation {
  const dimensions = vectorizeUsage(input)
  const workersAiInvocations = requireNonNegativeInteger(
    input.workersAiInvocations,
    'Workers AI invocation count'
  )
  const vectorizeQueryCalls = requireNonNegativeInteger(
    input.vectorizeQueryCalls,
    'Vectorize query call count'
  )
  const vectorizeMutationCalls = requireNonNegativeInteger(
    input.vectorizeMutationCalls,
    'Vectorize mutation call count'
  )
  if (input.queryVectors !== vectorizeQueryCalls) {
    throw new Error('Vectorize query call count must equal the query vector count')
  }
  if (input.insertedVectors > 0 && vectorizeMutationCalls === 0) {
    throw new Error('A Vectorize mutation call is required for inserted vectors')
  }
  const providerCalls = checkedAdd(
    [workersAiInvocations, vectorizeQueryCalls, vectorizeMutationCalls],
    'Provider calls'
  )
  const modelInputTokens = checkedMultiply(
    workersAiInvocations,
    CRM_SEARCH_MAX_INPUT_TOKENS,
    'Model input tokens'
  )

  const rateCard = requireCurrentRateCard(input.rateCard, input.reservationAt)
  const modelRate = requireRate(
    rateCard.modelInputUsdMicrosPerMillionTokens,
    'Model input rate'
  )
  const queriedRate = requireRate(
    rateCard.queriedDimensionUsdMicrosPerMillion,
    'Queried dimension rate'
  )
  const insertedRate = requireRate(
    rateCard.insertedDimensionUsdMicrosPerMillion,
    'Inserted dimension rate'
  )
  const storedRate = requireRate(
    rateCard.storedDimensionUsdMicrosPerMillionMonth,
    'Stored dimension rate'
  )

  const modelInputUsdMicros = ceilingMicroUsd(modelInputTokens, modelRate, 'Model cost')
  const queriedDimensionUsdMicros = ceilingMicroUsd(
    dimensions.queryDimensions,
    queriedRate,
    'Query-dimension cost'
  )
  const insertedDimensionUsdMicros = ceilingMicroUsd(
    dimensions.insertedDimensions,
    insertedRate,
    'Inserted-dimension cost'
  )
  const storedDimensionUsdMicros = ceilingMicroUsd(
    dimensions.storedDimensions,
    storedRate,
    'Stored-dimension cost'
  )
  const totalUsdMicros = checkedAdd([
    modelInputUsdMicros,
    queriedDimensionUsdMicros,
    insertedDimensionUsdMicros,
    storedDimensionUsdMicros
  ], 'Total provider cost')

  return {
    providerCalls,
    modelInputTokens,
    rateCardRevision: rateCard.revision,
    ...dimensions,
    cost: {
      modelInputUsdMicros,
      queriedDimensionUsdMicros,
      insertedDimensionUsdMicros,
      storedDimensionUsdMicros,
      totalUsdMicros
    }
  }
}

export function evaluateCrmSearchUsageAdmission(input: {
  projected: CrmSearchUsageAmounts
  caps: CrmSearchUsageCaps
}): {
  allowed: boolean
  exceeded: CrmSearchUsageCapKey[]
  unknown: CrmSearchUsageCapKey[]
} {
  const exceeded: CrmSearchUsageCapKey[] = []
  const unknown: CrmSearchUsageCapKey[] = []
  for (const key of usageCapKeys) {
    const projected = requireNonNegativeInteger(input.projected?.[key], `Projected ${key}`)
    const cap = input.caps?.[key]
    if (!Number.isSafeInteger(cap) || (cap as number) < 0) {
      unknown.push(key)
    } else if (projected > (cap as number)) {
      exceeded.push(key)
    }
  }
  return { allowed: exceeded.length === 0 && unknown.length === 0, exceeded, unknown }
}

function requireInventory(input: CrmSearchCapacityInventory): {
  totalNamespaces: number
  totalVectors: number
} {
  const keys: readonly CrmSearchCapacityInventoryKey[] = [
    'active', 'candidate', 'retiring', 'sentinel', 'deletionPending'
  ]
  const namespaceCounts: number[] = []
  const vectorCounts: number[] = []
  for (const key of keys) {
    const bucket = input?.[key]
    if (!bucket || typeof bucket !== 'object') {
      throw new TypeError(`CRM search capacity inventory is missing ${key}`)
    }
    namespaceCounts.push(requireNonNegativeInteger(bucket.namespaces, `${key} namespaces`))
    vectorCounts.push(requireNonNegativeInteger(bucket.vectors, `${key} vectors`))
  }
  return {
    totalNamespaces: checkedAdd(namespaceCounts, 'Total namespaces'),
    totalVectors: checkedAdd(vectorCounts, 'Total vectors')
  }
}

function parseCapacityLimit(value: unknown, label: 'namespaces' | 'vectors'): number | null {
  if (value === null || value === undefined) return null
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new RangeError(`CRM search ${label} capacity limit is invalid`)
  }
  const maximum = label === 'namespaces'
    ? CRM_SEARCH_VECTORIZE_MAX_NAMESPACES
    : CRM_SEARCH_VECTORIZE_MAX_VECTORS
  if ((value as number) > maximum) {
    throw new RangeError(`CRM search ${label} capacity limit exceeds the pinned provider maximum`)
  }
  return value as number
}

function belowAdmissionCeiling(total: number, limit: number | null): boolean {
  if (limit === null || limit === 0) return false
  return BigInt(total) * 100n < BigInt(limit) * BigInt(CRM_SEARCH_CAPACITY_ADMISSION_PERCENT)
}

export function forecastCrmSearchCapacity(input: CrmSearchCapacityForecastInput): {
  capacityReady: boolean
  totalNamespaces: number
  totalVectors: number
  namespaceHeadroom: number | null
  vectorHeadroom: number | null
  namespaceUtilization: number | null
  vectorUtilization: number | null
  namespaceAdmissionReady: boolean
  vectorAdmissionReady: boolean
  unknownLimits: Array<'namespaces' | 'vectors'>
} {
  const totals = requireInventory(input.inventory)
  const namespaceLimit = parseCapacityLimit(input.limits?.namespaces, 'namespaces')
  const vectorLimit = parseCapacityLimit(input.limits?.vectors, 'vectors')
  const unknownLimits: Array<'namespaces' | 'vectors'> = []
  if (namespaceLimit === null) unknownLimits.push('namespaces')
  if (vectorLimit === null) unknownLimits.push('vectors')

  const namespaceAdmissionReady = belowAdmissionCeiling(
    totals.totalNamespaces,
    namespaceLimit
  )
  const vectorAdmissionReady = belowAdmissionCeiling(totals.totalVectors, vectorLimit)
  return {
    capacityReady: namespaceAdmissionReady && vectorAdmissionReady,
    ...totals,
    namespaceHeadroom: namespaceLimit === null
      ? null
      : Math.max(0, namespaceLimit - totals.totalNamespaces),
    vectorHeadroom: vectorLimit === null
      ? null
      : Math.max(0, vectorLimit - totals.totalVectors),
    namespaceUtilization: namespaceLimit === null || namespaceLimit === 0
      ? null
      : totals.totalNamespaces / namespaceLimit,
    vectorUtilization: vectorLimit === null || vectorLimit === 0
      ? null
      : totals.totalVectors / vectorLimit,
    namespaceAdmissionReady,
    vectorAdmissionReady,
    unknownLimits
  }
}
