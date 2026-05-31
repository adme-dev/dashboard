import { describe, it, expect } from 'vitest'
import { percentile, percentileRank, summarize } from '~~/server/utils/benchmarks'

describe('percentile', () => {
  it('interpolates like percentile_cont', () => {
    expect(percentile([1, 2, 3, 4], 0.5)).toBe(2.5)
    expect(percentile([10, 20, 30], 0.5)).toBe(20)
    expect(percentile([10, 20, 30, 40], 0.25)).toBeCloseTo(17.5)
  })
  it('handles singletons and empties', () => {
    expect(percentile([42], 0.9)).toBe(42)
    expect(percentile([], 0.5)).toBeNull()
  })
  it('ignores non-finite values', () => {
    expect(percentile([1, 2, NaN, 3], 0.5)).toBe(2)
  })
})

describe('percentileRank', () => {
  it('returns the fraction of values at or below v', () => {
    expect(percentileRank([10, 20, 30, 40], 30)).toBe(0.75)
    expect(percentileRank([10, 20, 30, 40], 5)).toBe(0)
    expect(percentileRank([10, 20, 30, 40], 100)).toBe(1)
  })
  it('empty set → null', () => {
    expect(percentileRank([], 5)).toBeNull()
  })
})

describe('summarize', () => {
  it('reports count + quartiles + range', () => {
    const s = summarize([4, 1, 3, 2])
    expect(s).toMatchObject({ count: 4, min: 1, median: 2.5, max: 4 })
  })
  it('all-null on empty', () => {
    expect(summarize([])).toEqual({ count: 0, min: null, p25: null, median: null, p75: null, max: null })
  })
})
