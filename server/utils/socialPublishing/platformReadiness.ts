import { createError } from 'h3'

export interface SocialPublishingPlatformProductionStatus {
  value: string
  label: string
  productionReady: boolean
  reason: string
}

export const SOCIAL_PUBLISHING_PLATFORM_PRODUCTION_STATUS: SocialPublishingPlatformProductionStatus[] = [
  {
    value: 'facebook',
    label: 'Facebook',
    productionReady: true,
    reason: 'Ready for publishing account connection'
  },
  {
    value: 'instagram',
    label: 'Instagram',
    productionReady: true,
    reason: 'Connects through a linked Facebook Page'
  },
  {
    value: 'google-business',
    label: 'Google Business',
    productionReady: true,
    reason: 'Ready for publishing account connection'
  },
  {
    value: 'linkedin',
    label: 'LinkedIn',
    productionReady: false,
    reason: 'Organic organization discovery foundation is available; publishing, refresh hardening, and live provider smoke remain disabled'
  },
  {
    value: 'tiktok',
    label: 'TikTok',
    productionReady: false,
    reason: 'Content Posting creator OAuth foundation is available; publishing, refresh hardening, app audit, and live provider smoke remain disabled'
  },
  {
    value: 'youtube',
    label: 'YouTube',
    productionReady: false,
    reason: 'OAuth channel discovery foundation is available; upload publishing, refresh hardening, and live provider smoke remain disabled'
  }
]

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
