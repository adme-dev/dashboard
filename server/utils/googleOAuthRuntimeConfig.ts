import { getRequestURL, type H3Event } from 'h3'
import { getCachedBinding } from '~~/server/utils/email'

export const GOOGLE_ADS_CALLBACK_PATH = '/api/agency/social/google/callback'
export const GA4_CALLBACK_PATH = '/api/agency/social/ga4/callback'

type CloudflareContext = {
  cloudflare?: {
    env?: Record<string, unknown>
  }
}

interface GoogleOAuthRuntimeConfig {
  googleClientId: string
  googleClientSecret: string
  googleRedirectUri: string
  ga4RedirectUri: string
}

function eventBinding(event: H3Event | undefined, key: string): string | undefined {
  if (!event) return undefined
  const value = (event.context as CloudflareContext).cloudflare?.env?.[key]
  return typeof value === 'string' ? value : undefined
}

function firstConfigured(values: Array<unknown>): string {
  return values.map(value => String(value || '').trim()).find(Boolean) || ''
}

function readConfigValue(
  event: H3Event | undefined,
  runtimeConfig: Partial<GoogleOAuthRuntimeConfig>,
  runtimeKey: keyof GoogleOAuthRuntimeConfig,
  envKey: string,
  fallback = ''
): string {
  return firstConfigured([
    eventBinding(event, envKey),
    getCachedBinding(envKey),
    process.env[envKey],
    runtimeConfig[runtimeKey],
    fallback
  ])
}

export function resolveGoogleOAuthRuntimeConfig(
  event?: H3Event,
  runtimeConfig?: Partial<GoogleOAuthRuntimeConfig>
): GoogleOAuthRuntimeConfig {
  const config = runtimeConfig ?? (useRuntimeConfig() as Partial<GoogleOAuthRuntimeConfig>)

  return {
    googleClientId: readConfigValue(event, config, 'googleClientId', 'GOOGLE_CLIENT_ID'),
    googleClientSecret: readConfigValue(event, config, 'googleClientSecret', 'GOOGLE_CLIENT_SECRET'),
    googleRedirectUri: readConfigValue(event, config, 'googleRedirectUri', 'GOOGLE_REDIRECT_URI', GOOGLE_ADS_CALLBACK_PATH),
    ga4RedirectUri: readConfigValue(event, config, 'ga4RedirectUri', 'GA4_REDIRECT_URI', GA4_CALLBACK_PATH)
  }
}

export function callbackPath(configuredRedirectUri: string, fallbackPath: string): string {
  const configured = firstConfigured([configuredRedirectUri, fallbackPath])
  if (!configured) return fallbackPath
  return configured.startsWith('http') ? new URL(configured).pathname : configured
}

export function buildGoogleOAuthRedirectUri(event: H3Event, configuredRedirectUri: string, fallbackPath: string): string {
  const reqUrl = getRequestURL(event)
  return `${reqUrl.protocol}//${reqUrl.host}${callbackPath(configuredRedirectUri, fallbackPath)}`
}
