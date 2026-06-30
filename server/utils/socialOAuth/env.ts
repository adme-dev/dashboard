import { getRequestURL, type H3Event } from 'h3'
import { getCachedBinding } from '~~/server/utils/email'

type CloudflareContext = {
  cloudflare?: {
    env?: Record<string, unknown>
  }
}

const GOOGLE_BUSINESS_CALLBACK_PATH = '/api/agency/social/publishing/accounts/callback/google-business'
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
    getConfiguredValue(event, 'GOOGLE_BUSINESS_OAUTH_CLIENT_ID'),
    getConfiguredValue(event, 'NUXT_GOOGLE_BUSINESS_CLIENT_ID'),
    getConfiguredValue(event, 'GOOGLE_BUSINESS_CLIENT_ID'),
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

export function buildGoogleBusinessRedirectUri(event: H3Event): string {
  const { redirectUri } = getGoogleBusinessOAuthConfig(event)
  const base = getConfiguredValue(event, 'SOCIAL_OAUTH_REDIRECT_BASE') || getRequestURL(event).origin
  const callbackPath = redirectUri.startsWith('http') ? new URL(redirectUri).pathname : redirectUri
  return `${base}${callbackPath || GOOGLE_BUSINESS_CALLBACK_PATH}`
}
