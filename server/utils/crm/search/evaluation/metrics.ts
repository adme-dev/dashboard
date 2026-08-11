import {
  CRM_SEARCH_BOOTSTRAP_SAMPLES,
  type CrmSearchEvaluationMetrics,
  type CrmSearchMetricCase,
  type CrmSearchMetricSummary
} from './contracts'

const digestPattern = /^[a-f0-9]{64}$/u

interface MetricOptions {
  bootstrapSamples?: number
  bootstrapSeed: string
}

function fail(message: string): never {
  throw new Error(`CRM search granular metric evidence is invalid: ${message}`)
}

function validateCases(cases: unknown): asserts cases is CrmSearchMetricCase[] {
  if (!Array.isArray(cases) || cases.length < 1) fail('cases are required')
  for (const item of cases) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) fail('case must be an object')
    const record = item as Record<string, unknown>
    const allowedKeys = new Set(['queryKeyDigest', 'strata', 'judgements', 'keywordResults', 'assistResults'])
    if (Object.keys(record).some(key => !allowedKeys.has(key))) fail('caller-submitted aggregate or pass field')
    if (typeof record.queryKeyDigest !== 'string' || !digestPattern.test(record.queryKeyDigest)) fail('query digest')
    if (!Array.isArray(record.strata) || record.strata.length < 1
      || record.strata.some(value => typeof value !== 'string')) fail('strata')
    if (!Array.isArray(record.judgements) || !Array.isArray(record.keywordResults)
      || !Array.isArray(record.assistResults)) fail('granular judgements and result lists are required')
    for (const judgement of record.judgements) {
      if (!judgement || typeof judgement !== 'object' || Array.isArray(judgement)) fail('judgement')
      const candidate = judgement as Record<string, unknown>
      if (Object.keys(candidate).some(key => !['entityKeyDigest', 'relevance'].includes(key))
        || typeof candidate.entityKeyDigest !== 'string' || !digestPattern.test(candidate.entityKeyDigest)
        || typeof candidate.relevance !== 'number' || !Number.isInteger(candidate.relevance)
        || candidate.relevance < 0 || candidate.relevance > 3) fail('judgement')
    }
    for (const results of [record.keywordResults, record.assistResults]) {
      if (results.length > 50 || results.some(value => typeof value !== 'string' || !digestPattern.test(value))) {
        fail('bounded result digest list')
      }
      if (new Set(results).size !== results.length) fail('duplicate result digest')
    }
  }
}

function relevanceMap(item: CrmSearchMetricCase): Map<string, number> {
  return new Map(item.judgements.map(judgement => [judgement.entityKeyDigest, judgement.relevance]))
}

function dcg(results: string[], relevance: Map<string, number>, limit: number): number {
  return results.slice(0, limit).reduce((total, entityDigest, index) => {
    const grade = relevance.get(entityDigest) ?? 0
    return total + (2 ** grade - 1) / Math.log2(index + 2)
  }, 0)
}

function ndcg(results: string[], relevance: Map<string, number>, limit: number): number {
  const ideal = [...relevance.values()].filter(value => value > 0).sort((left, right) => right - left)
    .slice(0, limit)
    .reduce((total, grade, index) => total + (2 ** grade - 1) / Math.log2(index + 2), 0)
  return ideal === 0 ? (results.length === 0 ? 1 : 0) : dcg(results, relevance, limit) / ideal
}

interface PerCaseMetrics extends CrmSearchMetricSummary {
  hasRelevant: boolean
}

export interface CrmSearchGranularQueryRankingMetrics {
  keywordNdcg10: number
  assistNdcg10: number
  keywordMrr: number
  assistMrr: number
  keywordFalsePositive: boolean
  assistFalsePositive: boolean
}

function perCase(item: CrmSearchMetricCase, results: string[]): PerCaseMetrics {
  const relevance = relevanceMap(item)
  const relevant = new Set([...relevance.entries()].filter(([, grade]) => grade > 0).map(([key]) => key))
  const firstRelevantIndex = results.findIndex(entityDigest => relevant.has(entityDigest))
  return {
    precisionAt5: results.slice(0, 5).filter(entityDigest => relevant.has(entityDigest)).length / 5,
    recallAt10: relevant.size === 0
      ? (results.length === 0 ? 1 : 0)
      : results.slice(0, 10).filter(entityDigest => relevant.has(entityDigest)).length / relevant.size,
    mrr: relevant.size === 0 ? (results.length === 0 ? 1 : 0) : (firstRelevantIndex < 0 ? 0 : 1 / (firstRelevantIndex + 1)),
    ndcgAt10: ndcg(results, relevance, 10),
    hasRelevant: relevant.size > 0
  }
}

export function computeGranularQueryRankingMetrics(
  value: unknown
): CrmSearchGranularQueryRankingMetrics {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail('case must be an object')
  }
  const source = value as Record<string, unknown>
  const candidate = {
    queryKeyDigest: source.queryKeyDigest,
    strata: source.strata,
    judgements: source.judgements,
    keywordResults: source.keywordResults,
    assistResults: source.assistResults
  }
  const items: unknown = [candidate]
  validateCases(items)
  const item = items[0]!
  const keyword = perCase(item, item.keywordResults)
  const assist = perCase(item, item.assistResults)
  const noResult = item.strata.includes('no_result')
  return Object.freeze({
    keywordNdcg10: keyword.ndcgAt10,
    assistNdcg10: assist.ndcgAt10,
    keywordMrr: keyword.mrr,
    assistMrr: assist.mrr,
    keywordFalsePositive: noResult && item.keywordResults.length > 0,
    assistFalsePositive: noResult && item.assistResults.length > 0
  })
}

function average(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((total, value) => total + value, 0) / values.length
}

function summary(perQuery: PerCaseMetrics[]): CrmSearchMetricSummary {
  const ranked = perQuery.filter(metric => metric.hasRelevant)
  const basis = ranked.length > 0 ? ranked : perQuery
  return {
    precisionAt5: average(basis.map(metric => metric.precisionAt5)),
    recallAt10: average(basis.map(metric => metric.recallAt10)),
    mrr: average(basis.map(metric => metric.mrr)),
    ndcgAt10: average(basis.map(metric => metric.ndcgAt10))
  }
}

function stringHash(value: string): number {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function percentile(sorted: number[], probability: number): number {
  if (sorted.length === 0) return -1
  const position = (sorted.length - 1) * probability
  const lower = Math.floor(position)
  const upper = Math.ceil(position)
  if (lower === upper) return sorted[lower]!
  return sorted[lower]! + (sorted[upper]! - sorted[lower]!) * (position - lower)
}

function pairedBootstrap(deltas: number[], seed: string, samples: number): { lower: number, upper: number } {
  if (deltas.length === 0) return { lower: -1, upper: -1 }
  const means: number[] = []
  for (let sample = 0; sample < samples; sample += 1) {
    let total = 0
    for (let draw = 0; draw < deltas.length; draw += 1) {
      const index = stringHash(`${seed}:${sample + 1}:${draw + 1}`) % deltas.length
      total += deltas[index]!
    }
    means.push(total / deltas.length)
  }
  means.sort((left, right) => left - right)
  return { lower: percentile(means, 0.025), upper: percentile(means, 0.975) }
}

export function computeSearchMetrics(cases: unknown, options: MetricOptions): CrmSearchEvaluationMetrics {
  validateCases(cases)
  if (!digestPattern.test(options.bootstrapSeed)) fail('bootstrap seed')
  const samples = options.bootstrapSamples ?? CRM_SEARCH_BOOTSTRAP_SAMPLES
  if (samples !== CRM_SEARCH_BOOTSTRAP_SAMPLES) fail('bootstrap must use exactly 1,000 samples')

  const ordered = [...cases].sort((left, right) => left.queryKeyDigest.localeCompare(right.queryKeyDigest))
  const assist = ordered.map(item => perCase(item, item.assistResults))
  const keyword = ordered.map(item => perCase(item, item.keywordResults))
  const naturalDeltas = ordered.flatMap((item, index) => item.strata.includes('natural_language')
    ? [assist[index]!.ndcgAt10 - keyword[index]!.ndcgAt10]
    : [])
  const interval = pairedBootstrap(naturalDeltas, options.bootstrapSeed, samples)
  const noResult = ordered.filter(item => item.strata.includes('no_result'))

  return Object.freeze({
    ...summary(assist),
    keywordBaseline: summary(keyword),
    noResultFalsePositiveRate: noResult.length === 0
      ? 0
      : noResult.filter(item => item.assistResults.length > 0).length / noResult.length,
    bootstrapConfidenceIntervals: {
      naturalLanguageNdcgAt10Delta: {
        method: 'paired' as const,
        confidenceLevel: 0.95 as const,
        samples,
        ...interval
      }
    }
  })
}
