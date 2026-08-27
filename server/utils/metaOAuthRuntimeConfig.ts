import { getRequestURL, type H3Event } from 'h3'

export const META_OAUTH_CALLBACK_PATH = '/api/agency/social/meta/callback'

type CloudflareContext = {
  cloudflare?: {
    env?: Record<string, unknown>
  }
}

export interface MetaOAuthRuntimeConfig {
  metaAppId: string
  metaAppSecret: string
  metaRedirectUri: string
  metaLoginConfigId: string
}

function eventBinding(event: H3Event | undefined, key: string): string | undefined {
  if (!event) return undefined
  const value = (event.context as CloudflareContext).cloudflare?.env?.[key]
  return typeof value === 'string' ? value : undefined
}

function firstConfigured(values: unknown[]): string {
  return values.map(value => String(value || '').trim()).find(Boolean) || ''
}

function readConfigValue(
  event: H3Event | undefined,
  runtimeConfig: Partial<MetaOAuthRuntimeConfig>,
  runtimeKey: keyof MetaOAuthRuntimeConfig,
  envKey: string,
  fallback = '',
): string {
  return firstConfigured([
    eventBinding(event, envKey),
    process.env[envKey],
    runtimeConfig[runtimeKey],
    fallback,
  ])
}

export function resolveMetaOAuthRuntimeConfig(
  event?: H3Event,
  runtimeConfig?: Partial<MetaOAuthRuntimeConfig>,
): MetaOAuthRuntimeConfig {
  const config = runtimeConfig ?? (useRuntimeConfig() as Partial<MetaOAuthRuntimeConfig>)
  return {
    metaAppId: readConfigValue(event, config, 'metaAppId', 'META_APP_ID'),
    metaAppSecret: readConfigValue(event, config, 'metaAppSecret', 'META_APP_SECRET'),
    metaRedirectUri: readConfigValue(
      event,
      config,
      'metaRedirectUri',
      'META_REDIRECT_URI',
      META_OAUTH_CALLBACK_PATH,
    ),
    metaLoginConfigId: readConfigValue(event, config, 'metaLoginConfigId', 'META_LOGIN_CONFIG_ID'),
  }
}

export function metaOAuthCallbackPath(configuredRedirectUri: string): string {
  const configured = firstConfigured([configuredRedirectUri, META_OAUTH_CALLBACK_PATH])
  return configured.startsWith('http') ? new URL(configured).pathname : configured
}

export function buildMetaOAuthRedirectUri(event: H3Event, configuredRedirectUri: string): string {
  const reqUrl = getRequestURL(event)
  return `${reqUrl.protocol}//${reqUrl.host}${metaOAuthCallbackPath(configuredRedirectUri)}`
}
