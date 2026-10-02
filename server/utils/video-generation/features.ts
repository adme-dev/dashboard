import type { H3Event } from 'h3'
import { getCachedCfBinding } from '~~/server/utils/cfBindings'

export function videoFeatureEnabled(name: 'VIDEO_STUDIO_ENABLED' | 'VIDEO_GENERATION_ENABLED' | 'VIDEO_ASSET_HARNESS_ENABLED', event?: H3Event): boolean {
  return (event?.context?.cloudflare?.env?.[name] ?? getCachedCfBinding(name) ?? process.env[name]) === 'true'
}
