import { describe, it, expect } from 'vitest'
import { matchesQuery, bucketSentiment } from '~/app/utils/socialListeningMatch'

describe('matchesQuery', () => {
  it('keeps text containing any include term (case-insensitive)', () => {
    expect(matchesQuery('Love the new ACME widget', ['acme'], [])).toBe(true)
  })
  it('drops text with no include term', () => {
    expect(matchesQuery('unrelated chatter', ['acme'], [])).toBe(false)
  })
  it('drops text containing an exclude term even if an include term matches', () => {
    expect(matchesQuery('ACME stock price jumped', ['acme'], ['stock'])).toBe(false)
  })
  it('empty include terms never match (avoids capturing the whole firehose)', () => {
    expect(matchesQuery('anything', [], [])).toBe(false)
  })
  it('matches whole words and substrings alike, trimming terms', () => {
    expect(matchesQuery('AcmeCorp rocks', ['  acme '], [])).toBe(true)
  })
})

describe('bucketSentiment', () => {
  it('buckets numeric scores with the +/-0.2 thresholds', () => {
    expect(bucketSentiment(0.5)).toBe('positive')
    expect(bucketSentiment(-0.5)).toBe('negative')
    expect(bucketSentiment(0)).toBe('neutral')
  })
  it('returns unknown for null/NaN', () => {
    expect(bucketSentiment(null)).toBe('unknown')
    expect(bucketSentiment(Number.NaN)).toBe('unknown')
  })
})
