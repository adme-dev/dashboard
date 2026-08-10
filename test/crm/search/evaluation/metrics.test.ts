import { describe, expect, it } from 'vitest'
import {
  computeGranularQueryRankingMetrics,
  computeSearchMetrics
} from '~~/server/utils/crm/search/evaluation/metrics'

const digest = (character: string) => character.repeat(64)

const cases = [
  {
    queryKeyDigest: digest('1'),
    strata: ['natural_language'],
    judgements: [
      { entityKeyDigest: digest('a'), relevance: 3 },
      { entityKeyDigest: digest('b'), relevance: 1 }
    ],
    keywordResults: [digest('b'), digest('c'), digest('a')],
    assistResults: [digest('a'), digest('b'), digest('c')]
  },
  {
    queryKeyDigest: digest('2'),
    strata: ['no_result'],
    judgements: [],
    keywordResults: [],
    assistResults: []
  }
]

describe('CRM search evaluation metrics', () => {
  it('derives per-query database evidence from rankings and ignores submitted scores', () => {
    expect(computeGranularQueryRankingMetrics({
      ...cases[0],
      keywordNdcg10: 1,
      assistNdcg10: 0,
      gatePassed: true
    })).toMatchObject({
      keywordNdcg10: expect.any(Number),
      assistNdcg10: 1,
      keywordMrr: 1,
      assistMrr: 1,
      keywordFalsePositive: false,
      assistFalsePositive: false
    })
  })

  it('recomputes granular ranking metrics instead of accepting caller aggregates', () => {
    const metrics = computeSearchMetrics(cases, {
      bootstrapSamples: 1_000,
      bootstrapSeed: digest('9')
    })

    expect(metrics).toMatchObject({
      precisionAt5: expect.any(Number),
      recallAt10: 1,
      mrr: 1,
      ndcgAt10: 1,
      noResultFalsePositiveRate: 0,
      bootstrapConfidenceIntervals: {
        naturalLanguageNdcgAt10Delta: {
          method: 'paired',
          confidenceLevel: 0.95,
          samples: 1_000,
          lower: expect.any(Number),
          upper: expect.any(Number)
        }
      }
    })
    expect(metrics.keywordBaseline.ndcgAt10).toBeLessThan(metrics.ndcgAt10)
  })

  it('is deterministic for a frozen evidence digest and preserves query pairing', () => {
    const options = { bootstrapSamples: 1_000, bootstrapSeed: digest('8') }
    const first = computeSearchMetrics(cases, options)
    const second = computeSearchMetrics([...cases].reverse(), options)

    expect(second.bootstrapConfidenceIntervals).toEqual(first.bootstrapConfidenceIntervals)
    expect(first.bootstrapConfidenceIntervals.naturalLanguageNdcgAt10Delta.lower).toBeGreaterThan(0)
  })

  it('counts unsupported results in the no-result stratum as false positives', () => {
    const metrics = computeSearchMetrics([{
      ...cases[1],
      assistResults: [digest('f')]
    }], { bootstrapSamples: 1_000, bootstrapSeed: digest('7') })

    expect(metrics.noResultFalsePositiveRate).toBe(1)
  })

  it('rejects aggregate-only evidence and caller-supplied metric/pass fields', () => {
    expect(() => computeSearchMetrics([{
      queryKeyDigest: digest('3'),
      metrics: { ndcgAt10: 1 },
      gatePassed: true
    }] as never, { bootstrapSamples: 1_000, bootstrapSeed: digest('6') }))
      .toThrow(/granular|judgement|result/i)
  })
})
