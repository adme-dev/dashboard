import { platformPublishingSupport } from '~~/shared/socialCapabilityReadiness'
import { createError } from 'h3'

export interface SocialPublishingPlatformProductionStatus {
  value: string
  label: string
  productionReady: boolean
  reason: string
}

export const SOCIAL_PUBLISHING_PLATFORM_PRODUCTION_STATUS: SocialPublishingPlatformProductionStatus[] = [
  ['facebook', 'Facebook'], ['instagram', 'Instagram'], ['google-business', 'Google Business'],
  ['linkedin', 'LinkedIn'], ['tiktok', 'TikTok'], ['youtube', 'YouTube']
].map(([value, label]) => ({ value: value!, label: label!, ...platformPublishingSupport(value!) }))

export const PRODUCTION_READY_SOCIAL_PUBLISH_PLATFORMS = SOCIAL_PUBLISHING_PLATFORM_PRODUCTION_STATUS
  .filter(platform => platform.productionReady)
  .map(platform => platform.value)

export const SUPPORTED_SOCIAL_PUBLISH_PLATFORMS = SOCIAL_PUBLISHING_PLATFORM_PRODUCTION_STATUS
  .map(platform => platform.value)

const STATUS_BY_VALUE = new Map(SOCIAL_PUBLISHING_PLATFORM_PRODUCTION_STATUS.map(platform => [platform.value, platform]))

export function socialPublishingPlatformProductionStatus(platform: string): SocialPublishingPlatformProductionStatus | null {
  return STATUS_BY_VALUE.get(platform) ?? null
}

export function isProductionReadySocialPublishPlatform(platform: string): boolean {
  return socialPublishingPlatformProductionStatus(platform)?.productionReady ?? false
}

export function productionReadyPublishPlatformsError(platforms: string[]): string | null {
  for (const platform of Array.from(new Set(platforms))) {
    const status = socialPublishingPlatformProductionStatus(platform)
    if (!status) return `Unsupported platform: ${platform}`
    if (!status.productionReady) {
      return `${status.label} publishing is not production-ready: ${status.reason}`
    }
  }

  return null
}

export function assertProductionReadyPublishPlatforms(platforms: string[]): void {
  const error = productionReadyPublishPlatformsError(platforms)
  if (!error) return

  throw createError({
    statusCode: 400,
    statusMessage: error
  })
}
