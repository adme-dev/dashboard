import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockGetCachedBinding = vi.fn()

vi.mock('~~/server/utils/email', () => ({
  getCachedBinding: (key: string) => mockGetCachedBinding(key)
}))

describe('resolveGoogleOAuthRuntimeConfig', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetCachedBinding.mockReturnValue(undefined)
    Reflect.deleteProperty(process.env, 'GOOGLE_CLIENT_ID')
    Reflect.deleteProperty(process.env, 'GOOGLE_CLIENT_SECRET')
    Reflect.deleteProperty(process.env, 'GOOGLE_REDIRECT_URI')
    Reflect.deleteProperty(process.env, 'GA4_REDIRECT_URI')
    Reflect.deleteProperty(process.env, 'SEARCH_CONSOLE_REDIRECT_URI')
  })

  it('uses per-request Cloudflare bindings before process env or baked runtime config', async () => {
    process.env.GOOGLE_CLIENT_ID = 'process-client-id'
    process.env.GOOGLE_CLIENT_SECRET = 'process-client-secret'
    process.env.GA4_REDIRECT_URI = '/process/ga4/callback'

    mockGetCachedBinding.mockImplementation((key: string) => ({
      GOOGLE_CLIENT_ID: 'cached-client-id',
      GOOGLE_CLIENT_SECRET: 'cached-client-secret',
      GA4_REDIRECT_URI: '/cached/ga4/callback'
    }[key]))

    const event = {
      context: {
        cloudflare: {
          env: {
            GOOGLE_CLIENT_ID: 'request-client-id',
            GOOGLE_CLIENT_SECRET: 'request-client-secret',
            GOOGLE_REDIRECT_URI: '/request/google/callback',
            GA4_REDIRECT_URI: '/request/ga4/callback',
            SEARCH_CONSOLE_REDIRECT_URI: '/request/search-console/callback'
          }
        }
      }
    }

    const { resolveGoogleOAuthRuntimeConfig } = await import('~~/server/utils/googleOAuthRuntimeConfig')
    const config = resolveGoogleOAuthRuntimeConfig(event as Parameters<typeof resolveGoogleOAuthRuntimeConfig>[0], {
      googleClientId: 'runtime-client-id',
      googleClientSecret: 'runtime-client-secret',
      googleRedirectUri: '/runtime/google/callback',
      ga4RedirectUri: '/runtime/ga4/callback',
      searchConsoleRedirectUri: '/runtime/search-console/callback'
    })

    expect(config).toEqual({
      googleClientId: 'request-client-id',
      googleClientSecret: 'request-client-secret',
      googleRedirectUri: '/request/google/callback',
      ga4RedirectUri: '/request/ga4/callback',
      searchConsoleRedirectUri: '/request/search-console/callback'
    })
  })

  it('falls back to the GA4 callback path when no redirect is configured', async () => {
    const { resolveGoogleOAuthRuntimeConfig } = await import('~~/server/utils/googleOAuthRuntimeConfig')

    expect(resolveGoogleOAuthRuntimeConfig(undefined, {
      googleClientId: 'runtime-client-id',
      googleClientSecret: 'runtime-client-secret'
    }).ga4RedirectUri).toBe('/api/agency/social/ga4/callback')
  })

  it('falls back to the dedicated Search Console callback path', async () => {
    const { resolveGoogleOAuthRuntimeConfig } = await import('~~/server/utils/googleOAuthRuntimeConfig')

    expect(resolveGoogleOAuthRuntimeConfig(undefined, {
      googleClientId: 'runtime-client-id',
      googleClientSecret: 'runtime-client-secret'
    }).searchConsoleRedirectUri)
      .toBe('/api/agency/search-authority/google/callback')
  })
})

describe('callbackPath', () => {
  it('keeps only the pathname from an absolute configured redirect URI', async () => {
    const { callbackPath } = await import('~~/server/utils/googleOAuthRuntimeConfig')

    expect(callbackPath(
      'https://app.xeroflow.io/api/agency/social/ga4/callback',
      '/api/agency/social/ga4/callback'
    )).toBe('/api/agency/social/ga4/callback')
  })
})
