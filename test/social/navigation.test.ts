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

  it('keeps a stable setup-first canonical order for the sidebar and step indicator', () => {
    expect(SOCIAL_PUBLISHING_ROUTE_ORDER.map(item => item.key)).toEqual([
      'accounts',
      'calendar',
      'compose',
      'news',
      'feed',
      'approvals',
      'planner',
      'queue',
      'wall',
      'analytics'
    ])
  })

  it('groups routes into the five enterprise suite sections', () => {
    expect(SOCIAL_PUBLISHING_ROUTE_GROUPS.map(group => group.key)).toEqual([
      'create',
      'schedule',
      'review',
      'connect',
      'measure'
    ])
    expect(SOCIAL_PUBLISHING_ROUTE_GROUPS.map(group => group.label)).toEqual([
      'Create',
      'Schedule',
      'Review',
      'Connect',
      'Measure'
    ])
    expect(socialPublishingRouteGroups().map(group => group.items.map(item => item.key))).toEqual([
      ['compose', 'news', 'feed'],
      ['calendar', 'planner', 'queue'],
      ['approvals'],
      ['accounts'],
      ['wall', 'analytics']
    ])
  })

  it('tags the routes that surface a live count badge', () => {
    const badgeKeys = Object.fromEntries(
      SOCIAL_PUBLISHING_ROUTE_ORDER.map(item => [item.key, item.badgeKey])
    )
    expect(badgeKeys).toMatchObject({
      compose: 'drafts',
      calendar: 'scheduled',
      approvals: 'pendingApprovals',
      accounts: 'accounts',
      planner: 'campaigns'
    })
    expect(badgeKeys.queue).toBeUndefined()
    expect(badgeKeys.wall).toBeUndefined()
    expect(badgeKeys.analytics).toBeUndefined()
  })

  it('maps every ordered route into a sidebar-ready nav item', () => {
    expect(socialPublishingNavItems(() => {}).map(item => item.to)).toEqual([
      '/agency/social/publishing/accounts',
      '/agency/social/publishing/calendar',
      '/agency/social/publishing/compose',
      '/agency/social/publishing/news',
      '/agency/social/publishing/feed',
      '/agency/social/publishing/approvals',
      '/agency/social/publishing/planner',
      '/agency/social/publishing/queue',
      '/agency/social/publishing/wall',
      '/agency/social/publishing/analytics'
    ])
  })

  it('matches route paths to the correct publishing workflow item', () => {
    expect(socialPublishingRouteForPath('/agency/social/publishing/calendar')?.key).toBe('calendar')
    expect(socialPublishingRouteForPath('/agency/social/publishing/compose')?.key).toBe('compose')
    expect(socialPublishingRouteForPath('/agency/social/publishing/news')?.key).toBe('news')
    expect(socialPublishingRouteForPath('/agency/social/publishing/accounts')?.key).toBe('accounts')
    expect(socialPublishingRouteForPath('/agency/social/publishing/wall')?.key).toBe('wall')
    expect(socialPublishingRouteForPath('/agency/social/inbox')).toBeUndefined()
  })

  it('reports the active workflow step with one-based position context', () => {
    expect(socialPublishingStepForPath('/agency/social/publishing/planner')).toMatchObject({
      position: 7,
      total: 10,
      item: { key: 'planner' }
    })
    expect(socialPublishingStepForPath('/agency/social/listening')).toBeNull()
  })
})
