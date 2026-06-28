import { describe, it, expect, vi } from 'vitest'
import { isDealerFeedsEnabled, loadSocialDashboardConfig } from '~~/server/utils/feeds/config'

describe('isDealerFeedsEnabled', () => {
  it('is true only for the string "true"', () => {
    expect(isDealerFeedsEnabled({ DEALER_FEEDS_ENABLED: 'true' })).toBe(true)
    expect(isDealerFeedsEnabled({ DEALER_FEEDS_ENABLED: 'false' })).toBe(false)
    expect(isDealerFeedsEnabled({})).toBe(false)
  })
})

describe('loadSocialDashboardConfig', () => {
  it('returns null when the secret is missing', async () => {
    const queryOne = vi.fn(async () => ({ settings: { baseUrl: 'https://sd' } }))
    expect(await loadSocialDashboardConfig({ env: {}, queryOne: queryOne as any })).toBeNull()
  })
  it('returns null when no integration row / baseUrl', async () => {
    const queryOne = vi.fn(async () => null)
    expect(await loadSocialDashboardConfig({ env: { SOCIAL_DASHBOARD_SERVICE_SECRET: 's' }, queryOne: queryOne as any })).toBeNull()
  })
  it('returns baseUrl + secret when both present', async () => {
    const queryOne = vi.fn(async () => ({ settings: { baseUrl: 'https://sd.example' } }))
    const cfg = await loadSocialDashboardConfig({ env: { SOCIAL_DASHBOARD_SERVICE_SECRET: 's' }, queryOne: queryOne as any })
    expect(cfg).toEqual({ baseUrl: 'https://sd.example', serviceSecret: 's' })
  })
})
