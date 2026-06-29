import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockGetCachedBinding = vi.fn()

vi.mock('~~/server/utils/db', () => ({
  queryRows: vi.fn(),
  queryOne: vi.fn()
}))

vi.mock('~~/server/utils/email', () => ({
  getCachedBinding: (key: string) => mockGetCachedBinding(key)
}))

describe('resolveGoogleAdsRuntimeConfig', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetCachedBinding.mockReturnValue(undefined)
  })

  it('uses Cloudflare runtime bindings before baked Nuxt runtime config', async () => {
    mockGetCachedBinding.mockImplementation((key: string) => ({
      GOOGLE_CLIENT_ID: 'cf-client-id',
      GOOGLE_CLIENT_SECRET: 'cf-client-secret',
      GOOGLE_DEVELOPER_TOKEN: 'cf-dev-token',
      GOOGLE_ADS_LOGIN_CUSTOMER_ID: '123-456-7890'
    }[key]))

    const { resolveGoogleAdsRuntimeConfig } = await import('~~/server/utils/spendSync')

    expect(resolveGoogleAdsRuntimeConfig({
      googleClientId: '',
      googleClientSecret: '',
      googleDeveloperToken: '',
      googleAdsLoginCustomerId: ''
    })).toEqual({
      googleClientId: 'cf-client-id',
      googleClientSecret: 'cf-client-secret',
      googleDeveloperToken: 'cf-dev-token',
      googleAdsLoginCustomerId: '123-456-7890'
    })
  })

  it('uses per-request Cloudflare bindings before cached or baked config', async () => {
    mockGetCachedBinding.mockImplementation((key: string) => ({
      GOOGLE_CLIENT_ID: 'cached-client-id',
      GOOGLE_CLIENT_SECRET: 'cached-client-secret',
      GOOGLE_DEVELOPER_TOKEN: 'cached-dev-token',
      GOOGLE_ADS_LOGIN_CUSTOMER_ID: '1112223333'
    }[key]))

    const event = {
      context: {
        cloudflare: {
          env: {
            GOOGLE_CLIENT_ID: 'request-client-id',
            GOOGLE_CLIENT_SECRET: 'request-client-secret',
            GOOGLE_DEVELOPER_TOKEN: 'request-dev-token',
            GOOGLE_ADS_LOGIN_CUSTOMER_ID: '4445556666'
          }
        }
      }
    }

    const { resolveGoogleAdsRuntimeConfig } = await import('~~/server/utils/spendSync')
    const h3Event = event as Parameters<typeof resolveGoogleAdsRuntimeConfig>[1]

    expect(resolveGoogleAdsRuntimeConfig({
      googleClientId: 'runtime-client-id',
      googleClientSecret: 'runtime-client-secret',
      googleDeveloperToken: 'runtime-dev-token',
      googleAdsLoginCustomerId: '9876543210'
    }, h3Event)).toEqual({
      googleClientId: 'request-client-id',
      googleClientSecret: 'request-client-secret',
      googleDeveloperToken: 'request-dev-token',
      googleAdsLoginCustomerId: '4445556666'
    })
  })

  it('falls back to Nuxt runtime config when bindings are unavailable', async () => {
    const { resolveGoogleAdsRuntimeConfig } = await import('~~/server/utils/spendSync')

    expect(resolveGoogleAdsRuntimeConfig({
      googleClientId: 'runtime-client-id',
      googleClientSecret: 'runtime-client-secret',
      googleDeveloperToken: 'runtime-dev-token',
      googleAdsLoginCustomerId: '9876543210'
    })).toEqual({
      googleClientId: 'runtime-client-id',
      googleClientSecret: 'runtime-client-secret',
      googleDeveloperToken: 'runtime-dev-token',
      googleAdsLoginCustomerId: '9876543210'
    })
  })
})
