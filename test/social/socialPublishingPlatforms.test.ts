import { describe, expect, it } from 'vitest'
import {
  LIVE_SOCIAL_PUBLISHING_PLATFORM_OPTIONS,
  SOCIAL_PUBLISHING_PLATFORM_OPTIONS,
  socialPublishingPlatformLabel,
  socialPublishingPlatformReadiness
} from '../../app/utils/socialPublishingPlatforms'
import {
  PRODUCTION_READY_SOCIAL_PUBLISH_PLATFORMS,
  assertProductionReadyPublishPlatforms,
  isProductionReadySocialPublishPlatform,
  socialPublishingPlatformProductionStatus
} from '../../server/utils/socialPublishing/platformReadiness'

describe('social publishing platform registry', () => {
  it('keeps new-content platform selection limited to production-ready publishing flows', () => {
    expect(LIVE_SOCIAL_PUBLISHING_PLATFORM_OPTIONS.map(option => option.value)).toEqual([
      'facebook',
      'instagram',
      'google-business',
      'linkedin'
    ])
  })

  it('keeps planned platforms labelable for legacy posts and read-only filters', () => {
    expect(SOCIAL_PUBLISHING_PLATFORM_OPTIONS.find(option => option.value === 'tiktok')?.live).toBe(false)
    expect(socialPublishingPlatformLabel('youtube')).toBe('YouTube')
  })

  it('documents why paid-media OAuth cannot be used as organic publishing readiness', () => {
    expect(socialPublishingPlatformReadiness('linkedin')).toContain('Ready for Company Page connection')
    expect(socialPublishingPlatformReadiness('tiktok')).toContain('actual product eligibility')
    expect(socialPublishingPlatformReadiness('youtube')).toContain('OAuth channel discovery foundation is available')
    expect(socialPublishingPlatformReadiness('facebook')).toBe('Ready for publishing account connection')
  })

  it('keeps the server production-ready contract aligned with the UI live list', () => {
    expect(PRODUCTION_READY_SOCIAL_PUBLISH_PLATFORMS).toEqual(
      LIVE_SOCIAL_PUBLISHING_PLATFORM_OPTIONS.map(option => option.value)
    )
    expect(isProductionReadySocialPublishPlatform('google-business')).toBe(true)
    expect(isProductionReadySocialPublishPlatform('linkedin')).toBe(true)
    expect(isProductionReadySocialPublishPlatform('tiktok')).toBe(false)
    expect(socialPublishingPlatformProductionStatus('tiktok')?.reason)
      .toContain('app audit')
    expect(() => assertProductionReadyPublishPlatforms(['facebook', 'youtube']))
      .toThrow('YouTube publishing is not production-ready')
  })
})
