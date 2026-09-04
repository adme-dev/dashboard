import type { H3Event } from 'h3'
import { resolveGoogleOAuthRuntimeConfig } from '~~/server/utils/googleOAuthRuntimeConfig'

export const GTM_CALLBACK_PATH = '/api/agency/tracking/gtm/callback'

type CloudflareContext = {
  cloudflare?: {
    env?: Record<string, unknown>
  }
}

interface GtmOAuthRuntimeInput {
  gtmGoogleClientId: string
  gtmGoogleClientSecret: string
  gtmGoogleRedirectUri: string
  googleClientId: string
  googleClientSecret: string
  googleRedirectUri: string
  ga4RedirectUri: string
}

export interface GtmOAuthRuntimeConfig {
  googleClientId: string
  googleClientSecret: string
  googleRedirectUri: string
}

function eventBinding(event: H3Event | undefined, key: string): string | undefined {
  if (!event) return undefined
  const value = (event.context as CloudflareContext).cloudflare?.env?.[key]
  return typeof value === 'string' ? value : undefined
}

function firstConfigured(values: Array<unknown>): string {
  return values.map(value => String(value || '').trim()).find(Boolean) || ''
}

export function resolveGtmOAuthRuntimeConfig(
  event?: H3Event,
  runtimeConfig?: Partial<GtmOAuthRuntimeInput>,
): GtmOAuthRuntimeConfig {
  const config = runtimeConfig ?? (useRuntimeConfig() as Partial<GtmOAuthRuntimeInput>)
  const generic = resolveGoogleOAuthRuntimeConfig(event, config)

  return {
    googleClientId: firstConfigured([
      eventBinding(event, 'GTM_GOOGLE_CLIENT_ID'),
      process.env.GTM_GOOGLE_CLIENT_ID,
      config.gtmGoogleClientId,
      generic.googleClientId,
    ]),
    googleClientSecret: firstConfigured([
      eventBinding(event, 'GTM_GOOGLE_CLIENT_SECRET'),
      process.env.GTM_GOOGLE_CLIENT_SECRET,
      config.gtmGoogleClientSecret,
      generic.googleClientSecret,
    ]),
    googleRedirectUri: firstConfigured([
      eventBinding(event, 'GTM_GOOGLE_REDIRECT_URI'),
      process.env.GTM_GOOGLE_REDIRECT_URI,
      config.gtmGoogleRedirectUri,
      GTM_CALLBACK_PATH,
    ]),
  }
}
