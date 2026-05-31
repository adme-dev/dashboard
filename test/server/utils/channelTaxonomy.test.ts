import { describe, it, expect } from 'vitest'
import {
  taxonomyKey,
  fallbackChannel,
  resolveFromTaxonomy,
  type SourceSystem
} from '~~/server/utils/channelTaxonomy'

const taxonomy = new Map<string, string>([
  [taxonomyKey('ad_platform', 'google_ads'), 'Paid Search'],
  [taxonomyKey('ad_platform', 'meta'), 'Paid Social'],
  [taxonomyKey('ga4', 'Organic Search'), 'Organic Search']
])

describe('resolveFromTaxonomy', () => {
  it('resolves a known pair from the table', () => {
    expect(resolveFromTaxonomy(taxonomy, 'ad_platform', 'google_ads')).toBe('Paid Search')
    expect(resolveFromTaxonomy(taxonomy, 'ga4', 'Organic Search')).toBe('Organic Search')
  })

  it('falls back to channelMap rules when the table lacks the pair', () => {
    // 'meta_ads' is not in the test table but is a channelMap alias for Paid Social
    expect(resolveFromTaxonomy(taxonomy, 'ad_platform', 'meta_ads')).toBe('Paid Social')
  })

  it('returns the native value for unknown GA4 channels (already canonical)', () => {
    expect(resolveFromTaxonomy(taxonomy, 'ga4', 'Audio')).toBe('Audio')
  })

  it('records unmapped ad-platform/lead-source values instead of silently bucketing', () => {
    const unmapped = new Map<string, { system: SourceSystem; nativeValue: string }>()
    expect(resolveFromTaxonomy(taxonomy, 'ad_platform', 'tiktok', unmapped)).toBeNull()
    expect(resolveFromTaxonomy(taxonomy, 'lead_source', 'carsales', unmapped)).toBeNull()
    expect([...unmapped.values()]).toEqual([
      { system: 'ad_platform', nativeValue: 'tiktok' },
      { system: 'lead_source', nativeValue: 'carsales' }
    ])
  })

  it('does NOT record a miss when the fallback succeeds', () => {
    const unmapped = new Map<string, { system: SourceSystem; nativeValue: string }>()
    resolveFromTaxonomy(taxonomy, 'ad_platform', 'meta_ads', unmapped)
    expect(unmapped.size).toBe(0)
  })
})

describe('fallbackChannel', () => {
  it('maps paid platforms and returns null for unmapped paid sources', () => {
    expect(fallbackChannel('ad_platform', 'google_ads')).toBe('Paid Search')
    expect(fallbackChannel('lead_source', 'meta')).toBe('Paid Social')
    expect(fallbackChannel('ad_platform', 'unknown')).toBeNull()
  })

  it('treats GA4 channel groups as already-canonical (identity)', () => {
    expect(fallbackChannel('ga4', 'Referral')).toBe('Referral')
    expect(fallbackChannel('ga4', '')).toBeNull()
  })
})
