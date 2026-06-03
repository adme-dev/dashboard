import { describe, expect, it } from 'vitest'
import {
  PORTAL_SOCIAL_OBJECTIVE,
  PORTAL_SOCIAL_ROUTE_ORDER,
  portalSocialNavItems,
  portalSocialRouteForPath,
  portalSocialStepForPath
} from '../../app/utils/portalSocialNavigation'

describe('portalSocialNavigation', () => {
  it('keeps the client-facing social objective explicit', () => {
    expect(PORTAL_SOCIAL_OBJECTIVE).toBe(
      'Review social conversations, approve replies, read reports, and track brand mentions from the client portal.'
    )
  })

  it('orders portal social routes by client workflow', () => {
    expect(PORTAL_SOCIAL_ROUTE_ORDER.map(item => item.key)).toEqual([
      'inbox',
      'reporting',
      'listening'
    ])

    expect(PORTAL_SOCIAL_ROUTE_ORDER.map(item => item.section)).toEqual([
      'Engagement',
      'Analytics & Reporting',
      'Social Listening'
    ])
  })

  it('builds portal navigation items from the ordered source', () => {
    expect(portalSocialNavItems(() => {}).map(item => item.label)).toEqual([
      'Social',
      'Social Reports',
      'Social Listening'
    ])
  })

  it('matches active route and step for portal social pages', () => {
    expect(portalSocialRouteForPath('/portal/social-inbox')?.key).toBe('inbox')
    expect(portalSocialRouteForPath('/portal/social-reporting')?.key).toBe('reporting')
    expect(portalSocialRouteForPath('/portal/social-listening')?.key).toBe('listening')
    expect(portalSocialRouteForPath('/agency/social/inbox')).toBeUndefined()

    expect(portalSocialStepForPath('/portal/social-listening')).toMatchObject({
      position: 3,
      total: 3
    })
  })
})
