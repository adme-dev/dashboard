import { describe, expect, it, vi } from 'vitest'

import {
  collectPageSpeedEvidence,
  normalizePerformanceEvidence,
  validateOwnedPerformanceUrl
} from '~~/server/utils/searchAuthority/performanceEvidence'

describe('Search Authority performance evidence', () => {
  it('keeps CrUX field evidence separate from Lighthouse lab evidence', () => {
    const result = normalizePerformanceEvidence({
      id: 'https://dealer.example.com/vehicles/h6',
      analysisUTCTimestamp: '2026-08-03T00:00:00.000Z',
      loadingExperience: {
        metrics: {
          LARGEST_CONTENTFUL_PAINT_MS: { percentile: 2400, category: 'FAST' },
          INTERACTION_TO_NEXT_PAINT: { percentile: 180, category: 'FAST' },
          CUMULATIVE_LAYOUT_SHIFT_SCORE: { percentile: 8, category: 'FAST' }
        }
      },
      lighthouseResult: {
        fetchTime: '2026-08-03T00:00:01.000Z',
        lighthouseVersion: '13.0.0',
        audits: {
          'largest-contentful-paint': { numericValue: 3100 },
          'cumulative-layout-shift': { numericValue: 0.12 }
        }
      }
    }, 'https://dealer.example.com/vehicles/h6')

    expect(result.status).toBe('available')
    expect(result.lcp).toMatchObject({ kind: 'field', value: 2400, unit: 'ms' })
    expect(result.inp).toMatchObject({ kind: 'field', value: 180, unit: 'ms' })
    expect(result.cls).toMatchObject({ kind: 'field', value: 0.08, unit: 'score' })
    expect(result.lab.lcp).toMatchObject({ kind: 'lab', value: 3100 })
    expect(result.lab.inp.kind).toBe('unavailable')
  })

  it('returns unavailable rather than zero when provider evidence is absent', () => {
    const result = normalizePerformanceEvidence({
      loadingExperience: { metrics: { LARGEST_CONTENTFUL_PAINT_MS: { percentile: null } } }
    }, 'https://dealer.example.com/')

    expect(result.status).toBe('unavailable')
    expect(result.lcp).toMatchObject({ kind: 'unavailable', value: null })
    expect(result.inp.value).toBeNull()
    expect(result.cls.value).toBeNull()
  })

  it('allows only credential-free public URLs on the approved owned origin', () => {
    expect(validateOwnedPerformanceUrl(
      'https://dealer.example.com/vehicles/h6',
      'https://dealer.example.com'
    )).toBe('https://dealer.example.com/vehicles/h6')
    expect(() => validateOwnedPerformanceUrl(
      'https://competitor.example.com/vehicles/h6',
      'https://dealer.example.com'
    )).toThrow(/approved owned origin/i)
    expect(() => validateOwnedPerformanceUrl('http://127.0.0.1/admin', 'http://127.0.0.1')).toThrow(/public HTTPS/i)
    expect(() => validateOwnedPerformanceUrl('https://[::1]/admin', 'https://[::1]')).toThrow(/public HTTPS/i)
  })

  it('fails closed without a provider key and never calls fetch', async () => {
    const fetcher = vi.fn()
    const result = await collectPageSpeedEvidence({
      url: 'https://dealer.example.com/vehicles/h6',
      ownedOrigin: 'https://dealer.example.com',
      apiKey: '',
      fetcher
    })

    expect(result.status).toBe('unavailable')
    expect(result.reasonCode).toBe('provider_key_missing')
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('rejects provider results that resolve outside the approved owned origin', async () => {
    const result = await collectPageSpeedEvidence({
      url: 'https://dealer.example.com/vehicles/h6',
      ownedOrigin: 'https://dealer.example.com',
      apiKey: 'secret',
      fetcher: vi.fn(async () => new Response(JSON.stringify({
        id: 'https://competitor.example.com/vehicles/h6',
        lighthouseResult: { audits: { 'largest-contentful-paint': { numericValue: 2000 } } }
      }), { status: 200 }))
    })

    expect(result.status).toBe('unavailable')
    expect(result.reasonCode).toBe('provider_cross_origin_redirect')
    expect(result.url).toBe('https://dealer.example.com/vehicles/h6')
  })
})
