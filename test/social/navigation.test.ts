import { describe, expect, it } from 'vitest'
import {
  SOCIAL_PUBLISHING_OBJECTIVE,
  SOCIAL_PUBLISHING_ROUTE_GROUPS,
  SOCIAL_PUBLISHING_ROUTE_ORDER,
  socialPublishingNavItems,
  socialPublishingRouteGroups,
  socialPublishingRouteForPath,
  socialPublishingStepForPath
} from '../../app/utils/socialPublishingNavigation'

describe('social publishing navigation order', () => {
  it('keeps the publishing objective explicit', () => {
    expect(SOCIAL_PUBLISHING_OBJECTIVE).toContain('Plan')
    expect(SOCIAL_PUBLISHING_OBJECTIVE).toContain('publish')
    expect(SOCIAL_PUBLISHING_OBJECTIVE).toContain('measure')
  })

  it('orders related routes by setup, workflow, and measurement', () => {
    expect(SOCIAL_PUBLISHING_ROUTE_ORDER.map(item => item.key)).toEqual([
      'accounts',
      'calendar',
      'compose',
      'approvals',
      'planner',
      'queue',
      'analytics'
    ])
  })

  it('uses Sprout-inspired publishing support buckets for route context', () => {
    expect(SOCIAL_PUBLISHING_ROUTE_GROUPS.map(group => group.label)).toEqual([
      'Publishing Basics',
      'Message approvals',
      'Additional Publishing Features',
      'Analytics & Reporting'
    ])
    expect(socialPublishingRouteGroups().map(group => group.items.map(item => item.key))).toEqual([
      ['accounts', 'calendar', 'compose'],
      ['approvals'],
      ['planner', 'queue'],
      ['analytics']
    ])
  })

  it('maps every ordered route into a sidebar-ready nav item', () => {
    expect(socialPublishingNavItems(() => {}).map(item => item.to)).toEqual([
      '/agency/social/publishing/accounts',
      '/agency/social/publishing',
      '/agency/social/publishing/compose',
      '/agency/social/publishing/approvals',
      '/agency/social/publishing/planner',
      '/agency/social/publishing/queue',
      '/agency/social/publishing/analytics'
    ])
  })

  it('matches route paths to the correct publishing workflow item', () => {
    expect(socialPublishingRouteForPath('/agency/social/publishing')?.key).toBe('calendar')
    expect(socialPublishingRouteForPath('/agency/social/publishing/compose')?.key).toBe('compose')
    expect(socialPublishingRouteForPath('/agency/social/publishing/accounts')?.key).toBe('accounts')
    expect(socialPublishingRouteForPath('/agency/social/inbox')).toBeUndefined()
  })

  it('reports the active workflow step with one-based position context', () => {
    expect(socialPublishingStepForPath('/agency/social/publishing/planner')).toMatchObject({
      position: 5,
      total: 7,
      item: { key: 'planner' }
    })
    expect(socialPublishingStepForPath('/agency/social/listening')).toBeNull()
  })
})
