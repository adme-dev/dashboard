import { describe, expect, it } from 'vitest'
import {
  META_OAUTH_CALLBACK_PATH,
  metaOAuthCallbackPath,
  resolveMetaOAuthRuntimeConfig,
} from '~~/server/utils/metaOAuthRuntimeConfig'

describe('Meta OAuth runtime config', () => {
  it('prefers per-request Cloudflare bindings over empty build-time runtime config', () => {
    const event = {
      context: {
        cloudflare: {
          env: {
            META_APP_ID: 'cloudflare-app-id',
            META_APP_SECRET: 'cloudflare-app-secret',
            META_REDIRECT_URI: 'https://app.xeroflow.io/api/agency/social/meta/callback',
            META_LOGIN_CONFIG_ID: 'business-login-config-id',
          },
        },
      },
    }

    expect(resolveMetaOAuthRuntimeConfig(event as never, {
      metaAppId: '',
      metaAppSecret: '',
      metaRedirectUri: '',
      metaLoginConfigId: '',
    })).toEqual({
      metaAppId: 'cloudflare-app-id',
      metaAppSecret: 'cloudflare-app-secret',
      metaRedirectUri: 'https://app.xeroflow.io/api/agency/social/meta/callback',
      metaLoginConfigId: 'business-login-config-id',
    })
  })

  it('uses only the path from an absolute configured callback URL', () => {
    expect(metaOAuthCallbackPath('https://example.com/custom/meta/callback'))
      .toBe('/custom/meta/callback')
    expect(metaOAuthCallbackPath('')).toBe(META_OAUTH_CALLBACK_PATH)
  })
})
