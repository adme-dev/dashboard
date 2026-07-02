import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  getLinkedInOrganicOAuthConfig,
  getGoogleBusinessOAuthConfig,
  getSocialOauthStateSecret,
  getTikTokContentOAuthConfig,
  getYouTubeOAuthConfig,
  isLinkedInOrganicConnectionEnabled,
  isGoogleBusinessConnectionEnabled,
  isGoogleBusinessPublishingEnabled,
  isTikTokContentConnectionEnabled,
  isYouTubeConnectionEnabled
} from '~~/server/utils/socialOAuth/env'

// env.ts resolves credentials from CF bindings, process.env, and runtimeConfig.
// Stub the binding lookup + the bare useRuntimeConfig() auto-import so we can drive
// resolution purely from process.env.
vi.mock('~~/server/utils/email', () => ({ getCachedBinding: () => undefined }))
vi.stubGlobal('useRuntimeConfig', () => ({}))

const VALID_CLIENT_ID = '65723781223-abcDEF_hyphen.apps.googleusercontent.com'
const KEYS = [
  'GOOGLE_BUSINESS_OAUTH_CLIENT_ID', 'NUXT_GOOGLE_BUSINESS_CLIENT_ID', 'GOOGLE_BUSINESS_CLIENT_ID',
  'GOOGLE_BUSINESS_OAUTH_CLIENT_SECRET', 'NUXT_GOOGLE_BUSINESS_CLIENT_SECRET', 'GOOGLE_BUSINESS_CLIENT_SECRET',
  'YOUTUBE_OAUTH_CLIENT_ID', 'NUXT_YOUTUBE_CLIENT_ID', 'YOUTUBE_CLIENT_ID',
  'YOUTUBE_OAUTH_CLIENT_SECRET', 'NUXT_YOUTUBE_CLIENT_SECRET', 'YOUTUBE_CLIENT_SECRET',
  'LINKEDIN_ORGANIC_CLIENT_ID', 'NUXT_LINKEDIN_ORGANIC_CLIENT_ID', 'LINKEDIN_CLIENT_ID',
  'LINKEDIN_ORGANIC_CLIENT_SECRET', 'NUXT_LINKEDIN_ORGANIC_CLIENT_SECRET', 'LINKEDIN_CLIENT_SECRET',
  'TIKTOK_CONTENT_CLIENT_KEY', 'NUXT_TIKTOK_CONTENT_CLIENT_KEY', 'TIKTOK_CLIENT_KEY', 'TIKTOK_APP_ID',
  'TIKTOK_CONTENT_CLIENT_SECRET', 'NUXT_TIKTOK_CONTENT_CLIENT_SECRET', 'TIKTOK_CLIENT_SECRET', 'TIKTOK_APP_SECRET',
  'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET',
  'GOOGLE_BUSINESS_REDIRECT_URI', 'YOUTUBE_REDIRECT_URI', 'LINKEDIN_ORGANIC_REDIRECT_URI', 'TIKTOK_CONTENT_REDIRECT_URI',
  'GOOGLE_BUSINESS_PUBLISHING_ENABLED', 'SOCIAL_OAUTH_STATE_SECRET', 'META_APP_SECRET'
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

  it('prefers the shared Google OAuth client over stale Google Business-specific credentials', () => {
    process.env.GOOGLE_CLIENT_ID = '246014271015-pruq7c8d0ijj5fdi2aaf1reaq32qsce8.apps.googleusercontent.com'
    process.env.GOOGLE_CLIENT_SECRET = 'shared-secret'
    process.env.GOOGLE_BUSINESS_OAUTH_CLIENT_ID = '65723781223-g4ouugrvugsfptuh7unta3sqcivok8bn.apps.googleusercontent.com'
    process.env.GOOGLE_BUSINESS_OAUTH_CLIENT_SECRET = 'stale-secret'
    const cfg = getGoogleBusinessOAuthConfig()
    expect(cfg.clientId).toBe('246014271015-pruq7c8d0ijj5fdi2aaf1reaq32qsce8.apps.googleusercontent.com')
    expect(cfg.clientSecret).toBe('shared-secret')
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

describe('getYouTubeOAuthConfig', () => {
  beforeEach(clearKeys)
  afterEach(clearKeys)

  it('uses the shared Google OAuth credentials when configured', () => {
    process.env.GOOGLE_CLIENT_ID = VALID_CLIENT_ID
    process.env.GOOGLE_CLIENT_SECRET = 'shared-secret'
    const cfg = getYouTubeOAuthConfig()
    expect(cfg.clientId).toBe(VALID_CLIENT_ID)
    expect(cfg.clientSecret).toBe('shared-secret')
  })

  it('defaults the redirect to the YouTube callback path when unset', () => {
    expect(getYouTubeOAuthConfig().redirectUri)
      .toBe('/api/agency/social/publishing/accounts/callback/youtube')
  })
})

describe('isYouTubeConnectionEnabled', () => {
  beforeEach(clearKeys)
  afterEach(clearKeys)

  it('allows YouTube channel connections when Google OAuth credentials exist', () => {
    process.env.GOOGLE_CLIENT_ID = VALID_CLIENT_ID
    process.env.GOOGLE_CLIENT_SECRET = 'a-secret'
    expect(isYouTubeConnectionEnabled()).toBe(true)
  })

  it('keeps the connection disabled when credentials are missing', () => {
    expect(isYouTubeConnectionEnabled()).toBe(false)
  })
})

describe('getLinkedInOrganicOAuthConfig', () => {
  beforeEach(clearKeys)
  afterEach(clearKeys)

  it('uses dedicated organic LinkedIn credentials when configured', () => {
    process.env.LINKEDIN_ORGANIC_CLIENT_ID = 'organic-client'
    process.env.LINKEDIN_ORGANIC_CLIENT_SECRET = 'organic-secret'
    const cfg = getLinkedInOrganicOAuthConfig()
    expect(cfg.clientId).toBe('organic-client')
    expect(cfg.clientSecret).toBe('organic-secret')
  })

  it('falls back to existing LinkedIn credentials while using the publishing callback path', () => {
    process.env.LINKEDIN_CLIENT_ID = 'ads-client'
    process.env.LINKEDIN_CLIENT_SECRET = 'ads-secret'
    const cfg = getLinkedInOrganicOAuthConfig()
    expect(cfg.clientId).toBe('ads-client')
    expect(cfg.clientSecret).toBe('ads-secret')
    expect(cfg.redirectUri).toBe('/api/agency/social/publishing/accounts/callback/linkedin')
  })
})

describe('isLinkedInOrganicConnectionEnabled', () => {
  beforeEach(clearKeys)
  afterEach(clearKeys)

  it('allows LinkedIn organization connections when OAuth credentials exist', () => {
    process.env.LINKEDIN_ORGANIC_CLIENT_ID = 'organic-client'
    process.env.LINKEDIN_ORGANIC_CLIENT_SECRET = 'organic-secret'
    expect(isLinkedInOrganicConnectionEnabled()).toBe(true)
  })

  it('keeps the connection disabled when credentials are missing', () => {
    expect(isLinkedInOrganicConnectionEnabled()).toBe(false)
  })
})

describe('getTikTokContentOAuthConfig', () => {
  beforeEach(clearKeys)
  afterEach(clearKeys)

  it('uses dedicated TikTok Content Posting credentials when configured', () => {
    process.env.TIKTOK_CONTENT_CLIENT_KEY = 'content-key'
    process.env.TIKTOK_CONTENT_CLIENT_SECRET = 'content-secret'
    const cfg = getTikTokContentOAuthConfig()
    expect(cfg.clientKey).toBe('content-key')
    expect(cfg.clientSecret).toBe('content-secret')
  })

  it('falls back to existing TikTok app credentials while using the publishing callback path', () => {
    process.env.TIKTOK_CLIENT_KEY = 'legacy-key'
    process.env.TIKTOK_CLIENT_SECRET = 'legacy-secret'
    const cfg = getTikTokContentOAuthConfig()
    expect(cfg.clientKey).toBe('legacy-key')
    expect(cfg.clientSecret).toBe('legacy-secret')
    expect(cfg.redirectUri).toBe('/api/agency/social/publishing/accounts/callback/tiktok')
  })
})

describe('isTikTokContentConnectionEnabled', () => {
  beforeEach(clearKeys)
  afterEach(clearKeys)

  it('allows TikTok creator connections when Content Posting OAuth credentials exist', () => {
    process.env.TIKTOK_CONTENT_CLIENT_KEY = 'content-key'
    process.env.TIKTOK_CONTENT_CLIENT_SECRET = 'content-secret'
    expect(isTikTokContentConnectionEnabled()).toBe(true)
  })

  it('keeps the connection disabled when credentials are missing', () => {
    expect(isTikTokContentConnectionEnabled()).toBe(false)
  })
})
