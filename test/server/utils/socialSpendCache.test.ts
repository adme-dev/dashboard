import { describe, expect, it } from 'vitest'
import { spendSummaryCachePlatforms } from '~~/server/utils/socialSpendCache'

describe('spendSummaryCachePlatforms', () => {
  it('invalidates both Google platform aliases', () => {
    expect(spendSummaryCachePlatforms('google_ads')).toEqual(['google_ads', 'google'])
    expect(spendSummaryCachePlatforms('google')).toEqual(['google_ads', 'google'])
  })

  it('leaves non-Google platforms unchanged', () => {
    expect(spendSummaryCachePlatforms('meta')).toEqual(['meta'])
    expect(spendSummaryCachePlatforms('linkedin')).toEqual(['linkedin'])
  })
})
