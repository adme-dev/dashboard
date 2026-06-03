export const SOCIAL_PUBLISHING_OBJECTIVE
  = 'Plan, create, approve, schedule, publish, and measure organic social content for each client from one workflow.'

export type SocialPublishingRouteKey
  = | 'accounts'
    | 'calendar'
    | 'compose'
    | 'approvals'
    | 'planner'
    | 'queue'
    | 'analytics'

export type SocialPublishingRouteGroupKey
  = | 'publishing-basics'
    | 'message-approvals'
    | 'additional-publishing'
    | 'analytics-reporting'

export interface SocialPublishingRouteGroup {
  key: SocialPublishingRouteGroupKey
  label: string
}

export interface SocialPublishingRouteItem {
  key: SocialPublishingRouteKey
  group: SocialPublishingRouteGroupKey
  label: string
  icon: string
  to: string
  exact?: boolean
  objective: string
}

export const SOCIAL_PUBLISHING_ROUTE_GROUPS: SocialPublishingRouteGroup[] = [
  {
    key: 'publishing-basics',
    label: 'Publishing Basics'
  },
  {
    key: 'message-approvals',
    label: 'Message approvals'
  },
  {
    key: 'additional-publishing',
    label: 'Additional Publishing Features'
  },
  {
    key: 'analytics-reporting',
    label: 'Analytics & Reporting'
  }
]

export const SOCIAL_PUBLISHING_ROUTE_ORDER: SocialPublishingRouteItem[] = [
  {
    key: 'accounts',
    group: 'publishing-basics',
    label: 'Accounts',
    icon: 'i-lucide-plug',
    to: '/agency/social/publishing/accounts',
    objective: 'Connect the client publishing pages and profiles before posts are scheduled.'
  },
  {
    key: 'calendar',
    group: 'publishing-basics',
    label: 'Calendar',
    icon: 'i-lucide-calendar-days',
    to: '/agency/social/publishing',
    exact: true,
    objective: 'Use the calendar as the hub for planning, reviewing, and opening scheduled posts.'
  },
  {
    key: 'compose',
    group: 'publishing-basics',
    label: 'Compose',
    icon: 'i-lucide-pen-square',
    to: '/agency/social/publishing/compose',
    objective: 'Create one base post, customize it per network, and choose publish timing.'
  },
  {
    key: 'approvals',
    group: 'message-approvals',
    label: 'Approvals',
    icon: 'i-lucide-clipboard-check',
    to: '/agency/social/publishing/approvals',
    objective: 'Review draft posts and approve or return them before publishing.'
  },
  {
    key: 'planner',
    group: 'additional-publishing',
    label: 'Planner',
    icon: 'i-lucide-calendar-clock',
    to: '/agency/social/publishing/planner',
    objective: 'Define recurring posting slots that queued posts can fill automatically.'
  },
  {
    key: 'queue',
    group: 'additional-publishing',
    label: 'Queue',
    icon: 'i-lucide-list-ordered',
    to: '/agency/social/publishing/queue',
    objective: 'Prioritize queued posts before they take the next available posting slot.'
  },
  {
    key: 'analytics',
    group: 'analytics-reporting',
    label: 'Analytics',
    icon: 'i-lucide-bar-chart-3',
    to: '/agency/social/publishing/analytics',
    objective: 'Measure published, scheduled, draft, failed, and engagement outcomes.'
  }
]

export function socialPublishingRouteGroups() {
  return SOCIAL_PUBLISHING_ROUTE_GROUPS.map(group => ({
    ...group,
    items: SOCIAL_PUBLISHING_ROUTE_ORDER.filter(item => item.group === group.key)
  }))
}

export function socialPublishingNavItems(onSelect: () => void) {
  return SOCIAL_PUBLISHING_ROUTE_ORDER.map(item => ({
    label: item.label,
    icon: item.icon,
    to: item.to,
    exact: item.exact,
    onSelect
  }))
}

export function socialPublishingRouteForPath(path: string) {
  return SOCIAL_PUBLISHING_ROUTE_ORDER.find((item) => {
    if (item.exact) return path === item.to
    return path === item.to || path.startsWith(`${item.to}/`)
  })
}

export function socialPublishingStepForPath(path: string) {
  const index = SOCIAL_PUBLISHING_ROUTE_ORDER.findIndex((item) => {
    if (item.exact) return path === item.to
    return path === item.to || path.startsWith(`${item.to}/`)
  })

  if (index === -1) return null

  return {
    item: SOCIAL_PUBLISHING_ROUTE_ORDER[index],
    position: index + 1,
    total: SOCIAL_PUBLISHING_ROUTE_ORDER.length
  }
}
