import { getRequestURL, type H3Event } from 'h3'
import { getCachedBinding } from '~~/server/utils/email'

type CloudflareContext = {
  cloudflare?: {
    env?: Record<string, unknown>
  }
}

const GOOGLE_BUSINESS_CALLBACK_PATH = '/api/agency/social/publishing/accounts/callback/google-business'
const YOUTUBE_CALLBACK_PATH = '/api/agency/social/publishing/accounts/callback/youtube'
const LINKEDIN_ORGANIC_CALLBACK_PATH = '/api/agency/social/publishing/accounts/callback/linkedin'
const TIKTOK_CONTENT_CALLBACK_PATH = '/api/agency/social/publishing/accounts/callback/tiktok'
const GOOGLE_CLIENT_ID_PATTERN = /^\d+-[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/

function getCfBinding(event: H3Event | undefined, key: string): string | undefined {
  if (event) {
    const value = (event.context as CloudflareContext).cloudflare?.env?.[key]
    if (typeof value === 'string') return value
  }
  return getCachedBinding(key)
}

function getConfiguredValue(event: H3Event | undefined, key: string): string {
  return getCfBinding(event, key) || process.env[key] || ''
}

function firstConfigured(values: Array<string | undefined | null>): string {
  return values.map(value => String(value || '').trim()).find(Boolean) || ''
}

function resolveGoogleBusinessClientId(event: H3Event | undefined, runtimeValue: unknown): string {
  const candidates = [
    getConfiguredValue(event, 'GOOGLE_CLIENT_ID'),
    getConfiguredValue(event, 'GOOGLE_BUSINESS_OAUTH_CLIENT_ID'),
    getConfiguredValue(event, 'NUXT_GOOGLE_BUSINESS_CLIENT_ID'),
    getConfiguredValue(event, 'GOOGLE_BUSINESS_CLIENT_ID'),
    String(runtimeValue || '')
  ].map(value => value.trim()).filter(Boolean)

  return candidates.find(value => GOOGLE_CLIENT_ID_PATTERN.test(value)) || ''
}

function resolveYouTubeClientId(event: H3Event | undefined, runtimeValue: unknown): string {
  const candidates = [
    getConfiguredValue(event, 'GOOGLE_CLIENT_ID'),
    getConfiguredValue(event, 'YOUTUBE_OAUTH_CLIENT_ID'),
    getConfiguredValue(event, 'NUXT_YOUTUBE_CLIENT_ID'),
    getConfiguredValue(event, 'YOUTUBE_CLIENT_ID'),
    String(runtimeValue || '')
  ].map(value => value.trim()).filter(Boolean)

  return candidates.find(value => GOOGLE_CLIENT_ID_PATTERN.test(value)) || ''
}

export function getSocialOauthStateSecret(event?: H3Event): string {
  const config = useRuntimeConfig()
  return firstConfigured([
    getConfiguredValue(event, 'SOCIAL_OAUTH_STATE_SECRET'),
    getConfiguredValue(event, 'META_APP_SECRET'),
    getConfiguredValue(event, 'GOOGLE_BUSINESS_OAUTH_CLIENT_SECRET'),
    getConfiguredValue(event, 'NUXT_GOOGLE_BUSINESS_CLIENT_SECRET'),
    getConfiguredValue(event, 'GOOGLE_BUSINESS_CLIENT_SECRET'),
    getConfiguredValue(event, 'YOUTUBE_OAUTH_CLIENT_SECRET'),
    getConfiguredValue(event, 'NUXT_YOUTUBE_CLIENT_SECRET'),
    getConfiguredValue(event, 'YOUTUBE_CLIENT_SECRET'),
    getConfiguredValue(event, 'LINKEDIN_ORGANIC_CLIENT_SECRET'),
    getConfiguredValue(event, 'NUXT_LINKEDIN_ORGANIC_CLIENT_SECRET'),
    getConfiguredValue(event, 'LINKEDIN_CLIENT_SECRET'),
    getConfiguredValue(event, 'TIKTOK_CONTENT_CLIENT_SECRET'),
    getConfiguredValue(event, 'NUXT_TIKTOK_CONTENT_CLIENT_SECRET'),
    getConfiguredValue(event, 'TIKTOK_CLIENT_SECRET'),
    getConfiguredValue(event, 'TIKTOK_APP_SECRET'),
    getConfiguredValue(event, 'GOOGLE_CLIENT_SECRET'),
    String(config.googleBusinessClientSecret || '')
  ])
}

export function getGoogleBusinessOAuthConfig(event?: H3Event): {
  clientId: string
  clientSecret: string
  redirectUri: string
} {
  const config = useRuntimeConfig()
  return {
    clientId: resolveGoogleBusinessClientId(event, config.googleBusinessClientId),
    clientSecret: firstConfigured([
      getConfiguredValue(event, 'GOOGLE_CLIENT_SECRET'),
      getConfiguredValue(event, 'GOOGLE_BUSINESS_OAUTH_CLIENT_SECRET'),
      getConfiguredValue(event, 'NUXT_GOOGLE_BUSINESS_CLIENT_SECRET'),
      getConfiguredValue(event, 'GOOGLE_BUSINESS_CLIENT_SECRET'),
      String(config.googleBusinessClientSecret || '')
    ]),
    redirectUri: firstConfigured([
      getConfiguredValue(event, 'GOOGLE_BUSINESS_REDIRECT_URI'),
      String(config.googleBusinessRedirectUri || GOOGLE_BUSINESS_CALLBACK_PATH)
    ])
  }
}

export function isGoogleBusinessPublishingEnabled(event?: H3Event): boolean {
  return getConfiguredValue(event, 'GOOGLE_BUSINESS_PUBLISHING_ENABLED') === 'true'
}

export function isGoogleBusinessConnectionEnabled(event?: H3Event): boolean {
  if (isGoogleBusinessPublishingEnabled(event)) return true
  const { clientId, clientSecret } = getGoogleBusinessOAuthConfig(event)
  return Boolean(clientId && clientSecret)
}

export function getYouTubeOAuthConfig(event?: H3Event): {
  clientId: string
  clientSecret: string
  redirectUri: string
} {
  const config = useRuntimeConfig()
  return {
    clientId: resolveYouTubeClientId(event, config.youtubeClientId),
    clientSecret: firstConfigured([
      getConfiguredValue(event, 'GOOGLE_CLIENT_SECRET'),
      getConfiguredValue(event, 'YOUTUBE_OAUTH_CLIENT_SECRET'),
      getConfiguredValue(event, 'NUXT_YOUTUBE_CLIENT_SECRET'),
      getConfiguredValue(event, 'YOUTUBE_CLIENT_SECRET'),
      String(config.youtubeClientSecret || '')
    ]),
    redirectUri: firstConfigured([
      getConfiguredValue(event, 'YOUTUBE_REDIRECT_URI'),
      String(config.youtubeRedirectUri || YOUTUBE_CALLBACK_PATH)
    ])
  }
}

export function isYouTubeConnectionEnabled(event?: H3Event): boolean {
  const { clientId, clientSecret } = getYouTubeOAuthConfig(event)
  return Boolean(clientId && clientSecret)
}

export function getLinkedInOrganicOAuthConfig(event?: H3Event): {
  clientId: string
  clientSecret: string
  redirectUri: string
} {
  const config = useRuntimeConfig()
  return {
    clientId: firstConfigured([
      getConfiguredValue(event, 'LINKEDIN_ORGANIC_CLIENT_ID'),
      getConfiguredValue(event, 'NUXT_LINKEDIN_ORGANIC_CLIENT_ID'),
      getConfiguredValue(event, 'LINKEDIN_CLIENT_ID'),
      String(config.linkedinOrganicClientId || ''),
      String(config.linkedinClientId || '')
    ]),
    clientSecret: firstConfigured([
      getConfiguredValue(event, 'LINKEDIN_ORGANIC_CLIENT_SECRET'),
      getConfiguredValue(event, 'NUXT_LINKEDIN_ORGANIC_CLIENT_SECRET'),
      getConfiguredValue(event, 'LINKEDIN_CLIENT_SECRET'),
      String(config.linkedinOrganicClientSecret || ''),
      String(config.linkedinClientSecret || '')
    ]),
    redirectUri: firstConfigured([
      getConfiguredValue(event, 'LINKEDIN_ORGANIC_REDIRECT_URI'),
      String(config.linkedinOrganicRedirectUri || LINKEDIN_ORGANIC_CALLBACK_PATH)
    ])
  }
}

export function isLinkedInOrganicConnectionEnabled(event?: H3Event): boolean {
  const { clientId, clientSecret } = getLinkedInOrganicOAuthConfig(event)
  return Boolean(clientId && clientSecret)
}

export function getTikTokContentOAuthConfig(event?: H3Event): {
  clientKey: string
  clientSecret: string
  redirectUri: string
} {
  const config = useRuntimeConfig()
  return {
    clientKey: firstConfigured([
      getConfiguredValue(event, 'TIKTOK_CONTENT_CLIENT_KEY'),
      getConfiguredValue(event, 'NUXT_TIKTOK_CONTENT_CLIENT_KEY'),
      getConfiguredValue(event, 'TIKTOK_CLIENT_KEY'),
      getConfiguredValue(event, 'TIKTOK_APP_ID'),
      String(config.tiktokContentClientKey || ''),
      String(config.tiktokClientKey || ''),
      String(config.tiktokAppId || '')
    ]),
    clientSecret: firstConfigured([
      getConfiguredValue(event, 'TIKTOK_CONTENT_CLIENT_SECRET'),
      getConfiguredValue(event, 'NUXT_TIKTOK_CONTENT_CLIENT_SECRET'),
      getConfiguredValue(event, 'TIKTOK_CLIENT_SECRET'),
      getConfiguredValue(event, 'TIKTOK_APP_SECRET'),
      String(config.tiktokContentClientSecret || ''),
      String(config.tiktokClientSecret || ''),
      String(config.tiktokAppSecret || '')
    ]),
    redirectUri: firstConfigured([
      getConfiguredValue(event, 'TIKTOK_CONTENT_REDIRECT_URI'),
      String(config.tiktokContentRedirectUri || TIKTOK_CONTENT_CALLBACK_PATH)
    ])
  }
}

export function isTikTokContentConnectionEnabled(event?: H3Event): boolean {
  const { clientKey, clientSecret } = getTikTokContentOAuthConfig(event)
  return Boolean(clientKey && clientSecret)
}

export function buildGoogleBusinessRedirectUri(event: H3Event): string {
  const { redirectUri } = getGoogleBusinessOAuthConfig(event)
  const base = getConfiguredValue(event, 'SOCIAL_OAUTH_REDIRECT_BASE') || getRequestURL(event).origin
  const callbackPath = redirectUri.startsWith('http') ? new URL(redirectUri).pathname : redirectUri
  return `${base}${callbackPath || GOOGLE_BUSINESS_CALLBACK_PATH}`
}

export function buildYouTubeRedirectUri(event: H3Event): string {
  const { redirectUri } = getYouTubeOAuthConfig(event)
  const base = getConfiguredValue(event, 'SOCIAL_OAUTH_REDIRECT_BASE') || getRequestURL(event).origin
  const callbackPath = redirectUri.startsWith('http') ? new URL(redirectUri).pathname : redirectUri
  return `${base}${callbackPath || YOUTUBE_CALLBACK_PATH}`
}

export function buildLinkedInOrganicRedirectUri(event: H3Event): string {
  const { redirectUri } = getLinkedInOrganicOAuthConfig(event)
  const base = getConfiguredValue(event, 'SOCIAL_OAUTH_REDIRECT_BASE') || getRequestURL(event).origin
  const callbackPath = redirectUri.startsWith('http') ? new URL(redirectUri).pathname : redirectUri
  return `${base}${callbackPath || LINKEDIN_ORGANIC_CALLBACK_PATH}`
}

export function buildTikTokContentRedirectUri(event: H3Event): string {
  const { redirectUri } = getTikTokContentOAuthConfig(event)
  const base = getConfiguredValue(event, 'SOCIAL_OAUTH_REDIRECT_BASE') || getRequestURL(event).origin
  const callbackPath = redirectUri.startsWith('http') ? new URL(redirectUri).pathname : redirectUri
  return `${base}${callbackPath || TIKTOK_CONTENT_CALLBACK_PATH}`
}
