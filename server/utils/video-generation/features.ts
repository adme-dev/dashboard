import type { H3Event } from 'h3'
import { getCachedCfBinding, promoteCloudflarePlatformContext } from '~~/server/utils/cfBindings'

export function videoFeatureEnabled(name: 'VIDEO_STUDIO_ENABLED' | 'VIDEO_GENERATION_ENABLED' | 'VIDEO_ASSET_HARNESS_ENABLED', event?: H3Event): boolean {
  const platform = event?.context ? promoteCloudflarePlatformContext(event.context) : undefined
  return (platform?.env?.[name] ?? getCachedCfBinding(name) ?? process.env[name]) === 'true'
}
