import { describe, expect, it } from 'vitest'
import {
  decideBm25Gate,
  percentile,
  precisionAtK,
  recallAtK,
  reciprocalRank,
  summarizeEngine
} from '../../scripts/lakebase-pilot/metrics'

const legacy = {
  precisionAt5: 0.8,
  recallAt10: 0.7,
  mrr: 0.5,
  p50: 100,
  p95: 100,
  max: 100,
  failures: 0,
  fallbacks: 0,
  crossClientLeakage: 0,
  softDeleteLeakage: 0
}

describe('Lakebase pilot retrieval metrics', () => {
  it('calculates the prescribed ranking metrics and nearest-rank percentile', () => {
    expect(precisionAtK(['a', 'x', 'b'], new Set(['a', 'b']), 3)).toBeCloseTo(2 / 3)
    expect(recallAtK(['a', 'x', 'b'], new Set(['a', 'b', 'c']), 3)).toBeCloseTo(2 / 3)
    expect(reciprocalRank(['x', 'b', 'a'], new Set(['a', 'b']))).toBe(0.5)
    expect(percentile([10, 20, 30, 40], 0.95)).toBe(40)
  })

  it('treats an empty relevant set as correct only for an empty result list', () => {
    expect(precisionAtK([], new Set(), 5)).toBe(1)
    expect(recallAtK([], new Set(), 5)).toBe(1)
    expect(reciprocalRank([], new Set())).toBe(1)
    expect(precisionAtK(['unexpected'], new Set(), 5)).toBe(0)
    expect(recallAtK(['unexpected'], new Set(), 5)).toBe(0)
    expect(reciprocalRank(['unexpected'], new Set())).toBe(0)
  })

  it('evaluates exactly K unique ranks, treating missing ranks as non-relevant', () => {
    expect(precisionAtK(['a', 'b'], new Set(['a', 'b']), 5)).toBe(2 / 5)
    expect(precisionAtK(['a', 'a', 'b', 'x'], new Set(['a', 'b']), 3)).toBe(2 / 3)
  })

  it('rejects invalid numeric inputs instead of producing misleading metrics', () => {
    expect(() => precisionAtK(['a'], new Set(['a']), 0)).toThrow(RangeError)
    expect(() => percentile([], 0.95)).toThrow(RangeError)
    expect(() => percentile([10, Number.NaN], 0.95)).toThrow(TypeError)
    expect(() => percentile([10], 1.1)).toThrow(RangeError)
  })

  it('summarizes query metrics, latency, failures, and leakage deterministically', () => {
    const summary = summarizeEngine({
      judgements: [
        { queryId: 'q1', relevantIds: new Set(['a', 'b']) },
        { queryId: 'q2', relevantIds: new Set() }
      ],
      results: [
        { queryId: 'q1', resultIds: ['a', 'x', 'b'] },
        { queryId: 'q2', resultIds: [] }
      ],
      latencySamples: [40, 10, 20, 30],
      failures: 1,
      fallbacks: 2,
      crossClientLeakage: 3,
      softDeleteLeakage: 4
    })
    expect(summary.precisionAt5).toBeCloseTo(0.7)
    expect(summary).toMatchObject({
      recallAt10: 1, mrr: 1, p50: 20, p95: 40, max: 40,
      failures: 1, fallbacks: 2, crossClientLeakage: 3, softDeleteLeakage: 4
    })
  })
})

describe('Lakebase pilot BM25 acceptance gate', () => {
  it('blocks leakage in its stable order', () => {
    expect(decideBm25Gate({
      legacy,
      bm25: { ...legacy, crossClientLeakage: 1, softDeleteLeakage: 1, failures: 1 }
    })).toEqual({
      status: 'hold',
      passed: false,
      blockers: ['cross_client_leakage', 'soft_delete_leakage', 'query_failure', 'insufficient_improvement']
    })
  })

  it('blocks fallbacks and relevance regression even when latency improves', () => {
    expect(decideBm25Gate({
      legacy,
      bm25: { ...legacy, precisionAt5: 0.79, p95: 50, fallbacks: 1 }
    })).toEqual({
      status: 'hold',
      passed: false,
      blockers: ['query_failure', 'precision_regression', 'insufficient_improvement']
    })
  })

  it('blocks an MRR regression even when Precision@5 and latency improve', () => {
    expect(decideBm25Gate({
      legacy,
      bm25: { ...legacy, mrr: 0.49, p95: 50 }
    })).toEqual({
      status: 'hold',
      passed: false,
      blockers: ['precision_regression', 'insufficient_improvement']
    })
  })

  it('is eligible for review with the required MRR improvement and no precision regression', () => {
    expect(decideBm25Gate({
      legacy,
      bm25: { ...legacy, mrr: 0.6 }
    })).toEqual({ status: 'eligible_for_hybrid_review', passed: true, blockers: [] })
  })

  it('is eligible for review with required p95 improvement and no relevance regression', () => {
    expect(decideBm25Gate({
      legacy,
      bm25: { ...legacy, p95: 70 }
    })).toEqual({ status: 'eligible_for_hybrid_review', passed: true, blockers: [] })
  })

  it('holds just-below MRR and p95 improvements', () => {
    expect(decideBm25Gate({
      legacy,
      bm25: { ...legacy, mrr: 0.599999999999 }
    })).toEqual({ status: 'hold', passed: false, blockers: ['insufficient_improvement'] })
    expect(decideBm25Gate({
      legacy,
      bm25: { ...legacy, p95: 70.0000000001 }
    })).toEqual({ status: 'hold', passed: false, blockers: ['insufficient_improvement'] })
  })

  it('rejects invalid gate counts and denominators', () => {
    expect(() => decideBm25Gate({
      legacy,
      bm25: { ...legacy, failures: -1 }
    })).toThrow(RangeError)
    expect(() => decideBm25Gate({
      legacy: { ...legacy, p95: 0 },
      bm25: legacy
    })).toThrow(RangeError)
  })
})
