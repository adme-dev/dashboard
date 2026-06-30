import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// env.ts resolves credentials from CF bindings, process.env, and runtimeConfig.
// Stub the binding lookup + the bare useRuntimeConfig() auto-import so we can drive
// resolution purely from process.env.
vi.mock('~~/server/utils/email', () => ({ getCachedBinding: () => undefined }))
vi.stubGlobal('useRuntimeConfig', () => ({}))

import {
  getGoogleBusinessOAuthConfig,
  getSocialOauthStateSecret,
  isGoogleBusinessConnectionEnabled,
  isGoogleBusinessPublishingEnabled
} from '~~/server/utils/socialOAuth/env'

const VALID_CLIENT_ID = '65723781223-abcDEF_hyphen.apps.googleusercontent.com'
const KEYS = [
  'GOOGLE_BUSINESS_OAUTH_CLIENT_ID', 'NUXT_GOOGLE_BUSINESS_CLIENT_ID', 'GOOGLE_BUSINESS_CLIENT_ID',
  'GOOGLE_BUSINESS_OAUTH_CLIENT_SECRET', 'NUXT_GOOGLE_BUSINESS_CLIENT_SECRET', 'GOOGLE_BUSINESS_CLIENT_SECRET',
  'GOOGLE_BUSINESS_REDIRECT_URI', 'GOOGLE_BUSINESS_PUBLISHING_ENABLED', 'SOCIAL_OAUTH_STATE_SECRET', 'META_APP_SECRET'
]

function clearKeys() {
  for (const k of KEYS) Reflect.deleteProperty(process.env, k)
}

describe('getGoogleBusinessOAuthConfig', () => {
  beforeEach(clearKeys)
  afterEach(clearKeys)

  it('accepts a canonical Google OAuth client id', () => {
    process.env.GOOGLE_BUSINESS_CLIENT_ID = VALID_CLIENT_ID
    process.env.GOOGLE_BUSINESS_CLIENT_SECRET = 'a-secret'
    const cfg = getGoogleBusinessOAuthConfig()
    expect(cfg.clientId).toBe(VALID_CLIENT_ID)
    expect(cfg.clientSecret).toBe('a-secret')
  })

  it('rejects a malformed client id — guards against pasting the project number or wrong value', () => {
    process.env.GOOGLE_BUSINESS_CLIENT_ID = 'not-a-google-client-id'
    expect(getGoogleBusinessOAuthConfig().clientId).toBe('')
  })

  it('defaults the redirect to the GBP callback path when unset', () => {
    expect(getGoogleBusinessOAuthConfig().redirectUri)
      .toBe('/api/agency/social/publishing/accounts/callback/google-business')
  })
})

describe('getSocialOauthStateSecret', () => {
  beforeEach(clearKeys)
  afterEach(clearKeys)

  it('prefers the dedicated state secret', () => {
    process.env.SOCIAL_OAUTH_STATE_SECRET = 'dedicated'
    process.env.META_APP_SECRET = 'meta'
    expect(getSocialOauthStateSecret()).toBe('dedicated')
  })

  it('falls back to META_APP_SECRET so a Meta-only deployment still has a signing secret', () => {
    process.env.META_APP_SECRET = 'meta'
    expect(getSocialOauthStateSecret()).toBe('meta')
  })
})

describe('isGoogleBusinessPublishingEnabled', () => {
  beforeEach(clearKeys)
  afterEach(clearKeys)

  it('defaults off so GBP can ship dormant before Google approval', () => {
    expect(isGoogleBusinessPublishingEnabled()).toBe(false)
  })

  it('turns on only when explicitly enabled', () => {
    process.env.GOOGLE_BUSINESS_PUBLISHING_ENABLED = 'true'
    expect(isGoogleBusinessPublishingEnabled()).toBe(true)
  })
})

describe('isGoogleBusinessConnectionEnabled', () => {
  beforeEach(clearKeys)
  afterEach(clearKeys)

  it('allows review connections when valid Google Business OAuth credentials exist', () => {
    process.env.GOOGLE_BUSINESS_CLIENT_ID = VALID_CLIENT_ID
    process.env.GOOGLE_BUSINESS_CLIENT_SECRET = 'a-secret'
    expect(isGoogleBusinessConnectionEnabled()).toBe(true)
  })

  it('keeps the connection disabled when credentials are missing', () => {
    expect(isGoogleBusinessConnectionEnabled()).toBe(false)
  })
})
