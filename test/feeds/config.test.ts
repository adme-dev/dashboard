import { describe, it, expect, vi } from 'vitest'
import { isDealerFeedsEnabled, loadSocialDashboardConfig, resolveSocialDashboardBaseUrl } from '~~/server/utils/feeds/config'
import { cloudflareRuntimeEnv, mergedRuntimeEnv } from '~~/server/utils/feeds/serverContext'
import type { queryOne as dbQueryOne } from '~~/server/utils/db'

type QueryOne = typeof dbQueryOne

describe('isDealerFeedsEnabled', () => {
  it('is true only for the string "true"', () => {
    expect(isDealerFeedsEnabled({ DEALER_FEEDS_ENABLED: 'true' })).toBe(true)
    expect(isDealerFeedsEnabled({ DEALER_FEEDS_ENABLED: 'false' })).toBe(false)
    expect(isDealerFeedsEnabled({})).toBe(false)
  })
})

describe('loadSocialDashboardConfig', () => {
  it('returns null when the secret is missing', async () => {
    const queryOne: QueryOne = vi.fn(async () => ({ settings: { baseUrl: 'https://sd' } }))
    expect(await loadSocialDashboardConfig({ env: {}, queryOne })).toBeNull()
  })
  it('returns null when no integration row / baseUrl', async () => {
    const queryOne: QueryOne = vi.fn(async () => null)
    expect(await loadSocialDashboardConfig({ env: { SOCIAL_DASHBOARD_SERVICE_SECRET: 's' }, queryOne })).toBeNull()
  })
  it('returns baseUrl + secret when both present', async () => {
    const queryOne: QueryOne = vi.fn(async () => ({ settings: { baseUrl: 'https://sd.example' } }))
    const cfg = await loadSocialDashboardConfig({ env: { SOCIAL_DASHBOARD_SERVICE_SECRET: 's' }, queryOne })
    expect(cfg).toEqual({ baseUrl: 'https://sd.example', serviceSecret: 's', accessToken: undefined })
  })

  it('loads an optional social-dashboard access token', async () => {
    const queryOne: QueryOne = vi.fn(async () => ({ settings: { baseUrl: 'https://sd.example' } }))
    const cfg = await loadSocialDashboardConfig({
      env: { SOCIAL_DASHBOARD_SERVICE_SECRET: 's', SOCIAL_DASHBOARD_ACCESS_TOKEN: 'jwt' },
      queryOne
    })
    expect(cfg).toEqual({ baseUrl: 'https://sd.example', serviceSecret: 's', accessToken: 'jwt' })
  })

  it('can load Cloudflare runtime env bindings passed by server routes', async () => {
    const queryOne: QueryOne = vi.fn(async () => ({ settings: { baseUrl: 'https://sd.example' } }))
    const cfg = await loadSocialDashboardConfig({
      runtimeEnv: { SOCIAL_DASHBOARD_SERVICE_SECRET: 'runtime-secret', SOCIAL_DASHBOARD_ACCESS_TOKEN: 'runtime-jwt' },
      env: {},
      queryOne
    })
    expect(cfg).toEqual({ baseUrl: 'https://sd.example', serviceSecret: 'runtime-secret', accessToken: 'runtime-jwt' })
  })
})

describe('resolveSocialDashboardBaseUrl', () => {
  it('prefers configured env base URL without querying integration settings', async () => {
    const queryOne: QueryOne = vi.fn(async () => null)
    await expect(resolveSocialDashboardBaseUrl({
      env: { SOCIAL_DASHBOARD_BASE_URL: 'https://sd.env' },
      queryOne
    })).resolves.toBe('https://sd.env')
    expect(queryOne).not.toHaveBeenCalled()
  })

  it('falls back to the production feed service URL if settings lookup fails', async () => {
    const queryOne: QueryOne = vi.fn(async () => {
      throw new Error('database unavailable')
    })
    await expect(resolveSocialDashboardBaseUrl({
      env: {},
      runtimeEnv: {},
      queryOne
    })).resolves.toBe('https://socials.driveagent.io')
  })
})

describe('server runtime env helpers', () => {
  it('reads Cloudflare Pages env bindings from the event context', () => {
    const event = {
      context: {
        cloudflare: {
          env: {
            DEALER_FEEDS_ENABLED: 'true',
            SOCIAL_DASHBOARD_SERVICE_SECRET: 'runtime-secret'
          }
        }
      }
    } as unknown as Parameters<typeof cloudflareRuntimeEnv>[0]

    expect(cloudflareRuntimeEnv(event)).toEqual({
      DEALER_FEEDS_ENABLED: 'true',
      SOCIAL_DASHBOARD_SERVICE_SECRET: 'runtime-secret'
    })
    expect(mergedRuntimeEnv(event, { DEALER_FEEDS_ENABLED: 'false' })).toMatchObject({
      DEALER_FEEDS_ENABLED: 'true',
      SOCIAL_DASHBOARD_SERVICE_SECRET: 'runtime-secret'
    })
  })
})
