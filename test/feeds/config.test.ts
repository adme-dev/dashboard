import { describe, it, expect, vi } from 'vitest'
import { isDealerFeedsEnabled, loadSocialDashboardConfig } from '~~/server/utils/feeds/config'
import { cloudflareRuntimeEnv, mergedRuntimeEnv } from '~~/server/utils/feeds/serverContext'

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
    expect(cfg).toEqual({ baseUrl: 'https://sd.example', serviceSecret: 's', accessToken: undefined })
  })

  it('loads an optional social-dashboard access token', async () => {
    const queryOne = vi.fn(async () => ({ settings: { baseUrl: 'https://sd.example' } }))
    const cfg = await loadSocialDashboardConfig({
      env: { SOCIAL_DASHBOARD_SERVICE_SECRET: 's', SOCIAL_DASHBOARD_ACCESS_TOKEN: 'jwt' },
      queryOne: queryOne as any,
    })
    expect(cfg).toEqual({ baseUrl: 'https://sd.example', serviceSecret: 's', accessToken: 'jwt' })
  })

  it('can load Cloudflare runtime env bindings passed by server routes', async () => {
    const queryOne = vi.fn(async () => ({ settings: { baseUrl: 'https://sd.example' } }))
    const cfg = await loadSocialDashboardConfig({
      runtimeEnv: { SOCIAL_DASHBOARD_SERVICE_SECRET: 'runtime-secret', SOCIAL_DASHBOARD_ACCESS_TOKEN: 'runtime-jwt' },
      env: {},
      queryOne: queryOne as any,
    })
    expect(cfg).toEqual({ baseUrl: 'https://sd.example', serviceSecret: 'runtime-secret', accessToken: 'runtime-jwt' })
  })
})

describe('server runtime env helpers', () => {
  it('reads Cloudflare Pages env bindings from the event context', () => {
    const event = {
      context: {
        cloudflare: {
          env: {
            DEALER_FEEDS_ENABLED: 'true',
            SOCIAL_DASHBOARD_SERVICE_SECRET: 'runtime-secret',
          },
        },
      },
    } as any

    expect(cloudflareRuntimeEnv(event)).toEqual({
      DEALER_FEEDS_ENABLED: 'true',
      SOCIAL_DASHBOARD_SERVICE_SECRET: 'runtime-secret',
    })
    expect(mergedRuntimeEnv(event, { DEALER_FEEDS_ENABLED: 'false' })).toMatchObject({
      DEALER_FEEDS_ENABLED: 'true',
      SOCIAL_DASHBOARD_SERVICE_SECRET: 'runtime-secret',
    })
  })
})
