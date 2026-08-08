export interface RetrievalJudgement {
  queryId: string
  relevantIds: ReadonlySet<string>
}

export interface OrderedSearchResults {
  queryId: string
  resultIds: readonly string[]
}

export interface EngineMetricSummary {
  precisionAt5: number
  recallAt10: number
  mrr: number
  p50: number
  p95: number
  max: number
  failures: number
  fallbacks: number
  crossClientLeakage: number
  softDeleteLeakage: number
}

export interface SummarizeEngineInput {
  judgements: readonly RetrievalJudgement[]
  results: readonly OrderedSearchResults[]
  latencySamples: readonly number[]
  failures?: number
  fallbacks?: number
  crossClientLeakage?: number
  softDeleteLeakage?: number
}

export interface Bm25GateInput {
  legacy: EngineMetricSummary
  bm25: EngineMetricSummary
}

export interface Bm25GateDecision {
  status: 'eligible_for_hybrid_review' | 'hold'
  passed: boolean
  blockers: Array<
    | 'cross_client_leakage'
    | 'soft_delete_leakage'
    | 'query_failure'
    | 'precision_regression'
    | 'insufficient_improvement'
  >
}

const REQUIRED_MRR_IMPROVEMENT = 0.10
const REQUIRED_P95_IMPROVEMENT = 0.30

function requirePositiveInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 1) {
    throw new RangeError(`${name} must be a positive integer`)
  }
}

function requireFiniteNumber(value: number, name: string): void {
  if (!Number.isFinite(value)) throw new TypeError(`${name} must be a finite number`)
}

function requireNonNegativeInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative integer`)
  }
}

function noResultScore(resultIds: readonly string[], relevantIds: ReadonlySet<string>): number | null {
  if (relevantIds.size !== 0) return null
  return resultIds.length === 0 ? 1 : 0
}

function firstUniqueIds(resultIds: readonly string[], k: number): string[] {
  const uniqueIds: string[] = []
  const seen = new Set<string>()
  for (const id of resultIds) {
    if (seen.has(id)) continue
    seen.add(id)
    uniqueIds.push(id)
    if (uniqueIds.length === k) break
  }
  return uniqueIds
}

export function precisionAtK(
  resultIds: readonly string[],
  relevantIds: ReadonlySet<string>,
  k: number
): number {
  requirePositiveInteger(k, 'k')
  const emptyRelevantScore = noResultScore(resultIds, relevantIds)
  if (emptyRelevantScore !== null) return emptyRelevantScore

  const inspected = firstUniqueIds(resultIds, k)
  return inspected.filter(id => relevantIds.has(id)).length / k
}

export function recallAtK(
  resultIds: readonly string[],
  relevantIds: ReadonlySet<string>,
  k: number
): number {
  requirePositiveInteger(k, 'k')
  const emptyRelevantScore = noResultScore(resultIds, relevantIds)
  if (emptyRelevantScore !== null) return emptyRelevantScore

  const found = new Set(resultIds.slice(0, k).filter(id => relevantIds.has(id)))
  return found.size / relevantIds.size
}

export function reciprocalRank(resultIds: readonly string[], relevantIds: ReadonlySet<string>): number {
  const emptyRelevantScore = noResultScore(resultIds, relevantIds)
  if (emptyRelevantScore !== null) return emptyRelevantScore

  const firstRelevantIndex = resultIds.findIndex(id => relevantIds.has(id))
  return firstRelevantIndex === -1 ? 0 : 1 / (firstRelevantIndex + 1)
}

/** Uses the nearest-rank method: ceil(p × n), clamped to the last sample. */
export function percentile(samples: readonly number[], p: number): number {
  if (samples.length === 0) throw new RangeError('samples must not be empty')
  if (!Number.isFinite(p)) throw new TypeError('p must be a finite number')
  if (p < 0 || p > 1) throw new RangeError('p must be between zero and one')

  const sorted = samples.map((sample) => {
    requireFiniteNumber(sample, 'sample')
    return sample
  }).sort((left, right) => left - right)
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1))
  return sorted[index]!
}

function average(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0) / values.length
}

export function summarizeEngine(input: SummarizeEngineInput): EngineMetricSummary {
  if (input.judgements.length === 0) throw new RangeError('judgements must not be empty')

  const resultIdsByQuery = new Map<string, readonly string[]>()
  for (const result of input.results) {
    if (resultIdsByQuery.has(result.queryId)) throw new RangeError(`duplicate results for query ${result.queryId}`)
    resultIdsByQuery.set(result.queryId, result.resultIds)
  }

  const seenJudgements = new Set<string>()
  const precisionScores: number[] = []
  const recallScores: number[] = []
  const reciprocalRanks: number[] = []
  for (const judgement of input.judgements) {
    if (seenJudgements.has(judgement.queryId)) throw new RangeError(`duplicate judgement for query ${judgement.queryId}`)
    seenJudgements.add(judgement.queryId)
    const resultIds = resultIdsByQuery.get(judgement.queryId) ?? []
    precisionScores.push(precisionAtK(resultIds, judgement.relevantIds, 5))
    recallScores.push(recallAtK(resultIds, judgement.relevantIds, 10))
    reciprocalRanks.push(reciprocalRank(resultIds, judgement.relevantIds))
  }
  for (const queryId of resultIdsByQuery.keys()) {
    if (!seenJudgements.has(queryId)) throw new RangeError(`results without judgement for query ${queryId}`)
  }

  const failures = input.failures ?? 0
  const fallbacks = input.fallbacks ?? 0
  const crossClientLeakage = input.crossClientLeakage ?? 0
  const softDeleteLeakage = input.softDeleteLeakage ?? 0
  requireNonNegativeInteger(failures, 'failures')
  requireNonNegativeInteger(fallbacks, 'fallbacks')
  requireNonNegativeInteger(crossClientLeakage, 'crossClientLeakage')
  requireNonNegativeInteger(softDeleteLeakage, 'softDeleteLeakage')

  return {
    precisionAt5: average(precisionScores),
    recallAt10: average(recallScores),
    mrr: average(reciprocalRanks),
    p50: percentile(input.latencySamples, 0.5),
    p95: percentile(input.latencySamples, 0.95),
    max: percentile(input.latencySamples, 1),
    failures,
    fallbacks,
    crossClientLeakage,
    softDeleteLeakage
  }
}

function validateSummary(summary: EngineMetricSummary, name: string): void {
  for (const [metric, value] of Object.entries(summary)) {
    requireFiniteNumber(value, `${name}.${metric}`)
  }
  for (const metric of ['precisionAt5', 'recallAt10', 'mrr'] as const) {
    if (summary[metric] < 0 || summary[metric] > 1) {
      throw new RangeError(`${name}.${metric} must be between zero and one`)
    }
  }
  for (const metric of ['failures', 'fallbacks', 'crossClientLeakage', 'softDeleteLeakage'] as const) {
    requireNonNegativeInteger(summary[metric], `${name}.${metric}`)
  }
  for (const metric of ['p50', 'p95', 'max'] as const) {
    if (summary[metric] < 0) throw new RangeError(`${name}.${metric} must not be negative`)
  }
}

export function decideBm25Gate(input: Bm25GateInput): Bm25GateDecision {
  validateSummary(input.legacy, 'legacy')
  validateSummary(input.bm25, 'bm25')
  if (input.legacy.p95 <= 0) throw new RangeError('legacy.p95 must be greater than zero')

  const blockers: Bm25GateDecision['blockers'] = []
  const total = (metric: 'crossClientLeakage' | 'softDeleteLeakage' | 'failures' | 'fallbacks') => (
    input.legacy[metric] + input.bm25[metric]
  )
  if (total('crossClientLeakage') > 0) blockers.push('cross_client_leakage')
  if (total('softDeleteLeakage') > 0) blockers.push('soft_delete_leakage')
  if (total('failures') > 0 || total('fallbacks') > 0) blockers.push('query_failure')

  const relevanceRegression = input.bm25.precisionAt5 < input.legacy.precisionAt5
    || input.bm25.mrr < input.legacy.mrr
  if (relevanceRegression) blockers.push('precision_regression')

  const improvesMrr = input.bm25.mrr >= input.legacy.mrr + REQUIRED_MRR_IMPROVEMENT
    && input.bm25.precisionAt5 >= input.legacy.precisionAt5
  const improvesP95 = input.bm25.p95 <= input.legacy.p95 * (1 - REQUIRED_P95_IMPROVEMENT)
    && !relevanceRegression
  if (!improvesMrr && !improvesP95) blockers.push('insufficient_improvement')

  return blockers.length === 0
    ? { status: 'eligible_for_hybrid_review', passed: true, blockers }
    : { status: 'hold', passed: false, blockers }
}
