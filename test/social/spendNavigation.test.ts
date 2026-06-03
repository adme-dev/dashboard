import { describe, expect, it } from 'vitest'
import {
  SOCIAL_SPEND_OBJECTIVE,
  SOCIAL_SPEND_PLATFORM_ROUTES,
  SOCIAL_SPEND_ROUTE_ORDER,
  socialSpendNavItems,
  socialSpendRouteForPath,
  socialSpendStepForPath
} from '../../app/utils/socialSpendNavigation'

describe('social spend navigation', () => {
  it('keeps the paid social objective explicit', () => {
    expect(SOCIAL_SPEND_OBJECTIVE).toContain('Connect')
    expect(SOCIAL_SPEND_OBJECTIVE).toContain('sync spend')
    expect(SOCIAL_SPEND_OBJECTIVE).toContain('reconcile')
  })

  it('orders paid social routes from setup through spend review', () => {
    expect(SOCIAL_SPEND_ROUTE_ORDER.map(item => item.key)).toEqual([
      'connections',
      'spend',
      'meta',
      'google',
      'tiktok'
    ])
  })

  it('keeps expanded platform account routes available for the section component', () => {
    expect(SOCIAL_SPEND_PLATFORM_ROUTES.map(item => item.key)).toEqual([
      'meta',
      'google',
      'tiktok',
      'linkedin',
      'pinterest',
      'snapchat',
      'twitter',
      'microsoft_ads'
    ])
  })

  it('maps ordered routes into Nuxt UI navigation items', () => {
    expect(socialSpendNavItems(() => {}).map(item => item.to)).toEqual([
      '/agency/social',
      '/agency/social/spend',
      '/agency/social/meta',
      '/agency/social/google',
      '/agency/social/tiktok'
    ])
  })

  it('matches active routes and one-based workflow steps', () => {
    expect(socialSpendRouteForPath('/agency/social')?.key).toBe('connections')
    expect(socialSpendRouteForPath('/agency/social/spend')?.key).toBe('spend')
    expect(socialSpendRouteForPath('/agency/social/google')?.key).toBe('google')
    expect(socialSpendRouteForPath('/agency/social/publishing')).toBeUndefined()

    expect(socialSpendStepForPath('/agency/social/google')).toMatchObject({
      position: 4,
      total: 5,
      item: { key: 'google' }
    })
  })
})
