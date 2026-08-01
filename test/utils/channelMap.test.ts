// test/utils/channelMap.test.ts
import { describe, it, expect } from 'vitest'
import { adPlatformToChannel, leadSourceToChannel } from '~~/server/utils/channelMap'

describe('adPlatformToChannel', () => {
  it('maps google ad platforms to Paid Search', () => {
    expect(adPlatformToChannel('google_ads')).toBe('Paid Search')
    expect(adPlatformToChannel('google')).toBe('Paid Search')
  })
  it('maps meta ad platforms to Paid Social', () => {
    expect(adPlatformToChannel('meta')).toBe('Paid Social')
    expect(adPlatformToChannel('meta_ads')).toBe('Paid Social')
  })
  it('maps additional paid-social platforms and returns null for unknown platforms', () => {
    expect(adPlatformToChannel('tiktok')).toBe('Paid Social')
    expect(adPlatformToChannel('unknown')).toBeNull()
    expect(adPlatformToChannel('')).toBeNull()
  })
})

describe('leadSourceToChannel', () => {
  it('maps lead sources to paid channels', () => {
    expect(leadSourceToChannel('google')).toBe('Paid Search')
    expect(leadSourceToChannel('meta')).toBe('Paid Social')
  })
  it('maps manual leads to Direct and returns null for non-attributable sources', () => {
    expect(leadSourceToChannel('manual')).toBe('Direct')
    expect(leadSourceToChannel('webhook')).toBeNull()
    expect(leadSourceToChannel('csv')).toBeNull()
  })
})
