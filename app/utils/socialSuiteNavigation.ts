import type { SocialPublishingRouteItem } from './socialPublishingNavigation'
import { SOCIAL_PUBLISHING_ROUTE_ORDER } from './socialPublishingNavigation'

export type SocialSuiteSectionKey
  = | 'publishing'
    | 'engagement'
    | 'analytics-reporting'
    | 'social-listening'

export interface SocialSuiteNavItem {
  label: string
  icon: string
  to: string
  exact?: boolean
  objective: string
}

export interface SocialSuiteSection {
  key: SocialSuiteSectionKey
  label: string
  objective: string
  items: SocialSuiteNavItem[]
}

function fromPublishing(item: SocialPublishingRouteItem): SocialSuiteNavItem {
  return {
    label: item.key === 'analytics' ? 'Publishing Analytics' : item.label,
    icon: item.icon,
    to: item.to,
    exact: item.exact,
    objective: item.objective
  }
}

const publishingWorkflow = SOCIAL_PUBLISHING_ROUTE_ORDER
  .filter(item => item.key !== 'analytics')
  .map(fromPublishing)

const publishingAnalytics = SOCIAL_PUBLISHING_ROUTE_ORDER
  .filter(item => item.key === 'analytics')
  .map(fromPublishing)

export const SOCIAL_SUITE_SECTIONS: SocialSuiteSection[] = [
  {
    key: 'publishing',
    label: 'Publishing',
    objective: 'Set up accounts, plan content, compose posts, approve messages, and manage posting slots.',
    items: publishingWorkflow
  },
  {
    key: 'engagement',
    label: 'Engagement',
    objective: 'Manage social conversations, reviews, reply approvals, and automation.',
    items: [
      {
        label: 'Inbox',
        icon: 'i-lucide-messages-square',
        to: '/agency/social/inbox',
        exact: true,
        objective: 'Handle inbound comments, messages, and assigned social conversations.'
      },
      {
        label: 'Reply Queue',
        icon: 'i-lucide-bot-message-square',
        to: '/agency/social/inbox/approvals',
        objective: 'Review AI-assisted replies before they are sent.'
      },
      {
        label: 'Reviews',
        icon: 'i-lucide-star',
        to: '/agency/social/inbox/reviews',
        objective: 'Monitor and respond to review activity.'
      },
      {
        label: 'Automation',
        icon: 'i-lucide-bot',
        to: '/agency/social/inbox/automation',
        objective: 'Configure reply automation and approval rules.'
      },
      {
        label: 'Inbox Analytics',
        icon: 'i-lucide-bar-chart-3',
        to: '/agency/social/inbox/analytics',
        objective: 'Measure response times, SLA performance, and automation coverage.'
      },
      {
        label: 'Inbox Settings',
        icon: 'i-lucide-sliders-horizontal',
        to: '/agency/social/inbox/settings',
        objective: 'Tune inbox policies, channels, and saved reply setup.'
      }
    ]
  },
  {
    key: 'analytics-reporting',
    label: 'Analytics & Reporting',
    objective: 'Report on publishing outcomes, social performance, and engagement operations.',
    items: [
      ...publishingAnalytics,
      {
        label: 'Reporting',
        icon: 'i-lucide-line-chart',
        to: '/agency/social/reporting',
        exact: true,
        objective: 'Review organic performance, cadence, engagement, and scheduled reports.'
      }
    ]
  },
  {
    key: 'social-listening',
    label: 'Social Listening',
    objective: 'Track owned and open-web mentions to surface topics, sentiment, and brand signals.',
    items: [
      {
        label: 'Listening',
        icon: 'i-lucide-radar',
        to: '/agency/social/listening',
        exact: true,
        objective: 'Monitor mentions, sentiment, topics, and listening queries.'
      }
    ]
  }
]

export function socialSuiteNavItems(onSelect: () => void) {
  return SOCIAL_SUITE_SECTIONS.flatMap(section => [
    { type: 'label' as const, label: section.label },
    ...section.items.map(item => ({
      label: item.label,
      icon: item.icon,
      to: item.to,
      exact: item.exact,
      onSelect
    }))
  ])
}

export function socialSuiteItemForPath(path: string) {
  for (const section of SOCIAL_SUITE_SECTIONS) {
    const item = section.items.find((entry) => {
      if (entry.exact) return path === entry.to
      return path === entry.to || path.startsWith(`${entry.to}/`)
    })
    if (item) return { section, item }
  }

  return null
}
