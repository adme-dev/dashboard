import { describe, expect, it } from 'vitest'
import {
  SOCIAL_SUITE_SECTIONS,
  socialSuiteNavItems
} from '../../app/utils/socialSuiteNavigation'

describe('social suite navigation', () => {
  it('orders the social suite by publishing, engagement, reporting, and listening', () => {
    expect(SOCIAL_SUITE_SECTIONS.map(section => section.label)).toEqual([
      'Publishing',
      'Engagement',
      'Analytics & Reporting',
      'Social Listening'
    ])
  })

  it('keeps the sidebar routes grouped by operational objective', () => {
    expect(SOCIAL_SUITE_SECTIONS.map(section => section.items.map(item => item.label))).toEqual([
      ['Accounts', 'Calendar', 'Compose', 'News Inbox', 'Auto Feed', 'Approvals', 'Planner', 'Queue', 'Wall'],
      ['Inbox', 'Wall', 'Reply Queue', 'Reviews', 'Automation', 'Inbox Analytics', 'Inbox Settings'],
      ['Publishing Analytics', 'Reporting'],
      ['Listening']
    ])
  })

  it('maps sections to Nuxt UI navigation labels and items', () => {
    const items = socialSuiteNavItems(() => {})
    expect(items.map(item => item.label)).toEqual([
      'Publishing',
      'Accounts',
      'Calendar',
      'Compose',
      'News Inbox',
      'Auto Feed',
      'Approvals',
      'Planner',
      'Queue',
      'Wall',
      'Engagement',
      'Inbox',
      'Wall',
      'Reply Queue',
      'Reviews',
      'Automation',
      'Inbox Analytics',
      'Inbox Settings',
      'Analytics & Reporting',
      'Publishing Analytics',
      'Reporting',
      'Social Listening',
      'Listening'
    ])
  })
})
