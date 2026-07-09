import { describe, expect, it } from 'vitest'
import { normalizeDealerFeedFilters } from '~~/server/utils/feeds/filterInput'

describe('normalizeDealerFeedFilters', () => {
  it('keeps campaign setup filters and removes empty values', () => {
    expect(normalizeDealerFeedFilters({
      condition: ['New', '', 'Demo', 'New'],
      makes: ['Hyundai'],
      models: ['Tucson', ''],
      search: '  hybrid awd  ',
      years: { min: '2024', max: '2026' },
      price: { min: '30000', max: '' },
      kms: { min: '', max: '15000' },
      includeIds: ['BH123', ' VIN123 ', 'BH123'],
      excludeIds: [],
      unknown: ['drop me'],
    })).toEqual({
      condition: ['New', 'Demo'],
      makes: ['Hyundai'],
      models: ['Tucson'],
      search: 'hybrid awd',
      years: { min: 2024, max: 2026 },
      price: { min: 30000 },
      kms: { max: 15000 },
      includeIds: ['BH123', 'VIN123'],
    })
  })

  it('caps campaign stock refs and swaps reversed numeric ranges', () => {
    const refs = Array.from({ length: 5100 }, (_, index) => `S${index}`)
    const out = normalizeDealerFeedFilters({
      includeIds: refs,
      years: { min: 2027, max: 2024 },
      kms: { min: 25000, max: 10000 },
    })

    expect((out.includeIds as string[])).toHaveLength(5000)
    expect(out.years).toEqual({ min: 2024, max: 2027 })
    expect(out.kms).toEqual({ min: 10000, max: 25000 })
  })

  it('returns an empty filter object for malformed input', () => {
    expect(normalizeDealerFeedFilters(null)).toEqual({})
    expect(normalizeDealerFeedFilters(['condition'])).toEqual({})
  })
})
