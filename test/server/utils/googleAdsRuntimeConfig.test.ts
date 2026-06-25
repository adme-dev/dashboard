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
