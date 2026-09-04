import { beforeEach, describe, expect, it, vi } from 'vitest'

describe('resolveGtmOAuthRuntimeConfig', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    for (const key of [
      'GTM_GOOGLE_CLIENT_ID',
      'GTM_GOOGLE_CLIENT_SECRET',
      'GTM_GOOGLE_REDIRECT_URI',
      'GOOGLE_CLIENT_ID',
      'GOOGLE_CLIENT_SECRET',
    ]) Reflect.deleteProperty(process.env, key)
  })

  it('prefers dedicated per-request GTM credentials', async () => {
    const { resolveGtmOAuthRuntimeConfig } = await import('~~/server/utils/googleTagManagerOAuthRuntimeConfig')
    const event = {
      context: {
        cloudflare: {
          env: {
            GTM_GOOGLE_CLIENT_ID: 'request-gtm-id',
            GTM_GOOGLE_CLIENT_SECRET: 'request-gtm-secret',
            GTM_GOOGLE_REDIRECT_URI: 'https://app.xeroflow.io/api/agency/tracking/gtm/callback',
          },
        },
      },
    }

    expect(resolveGtmOAuthRuntimeConfig(
      event as Parameters<typeof resolveGtmOAuthRuntimeConfig>[0],
      {
        gtmGoogleClientId: 'runtime-gtm-id',
        gtmGoogleClientSecret: 'runtime-gtm-secret',
        googleClientId: 'generic-id',
        googleClientSecret: 'generic-secret',
      },
    )).toEqual({
      googleClientId: 'request-gtm-id',
      googleClientSecret: 'request-gtm-secret',
      googleRedirectUri: 'https://app.xeroflow.io/api/agency/tracking/gtm/callback',
    })
  })

  it('falls back to generic credentials without borrowing the generic callback', async () => {
    const { resolveGtmOAuthRuntimeConfig } = await import('~~/server/utils/googleTagManagerOAuthRuntimeConfig')

    expect(resolveGtmOAuthRuntimeConfig(undefined, {
      googleClientId: 'generic-id',
      googleClientSecret: 'generic-secret',
      googleRedirectUri: '/api/agency/social/google/callback',
    })).toEqual({
      googleClientId: 'generic-id',
      googleClientSecret: 'generic-secret',
      googleRedirectUri: '/api/agency/tracking/gtm/callback',
    })
  })
})
