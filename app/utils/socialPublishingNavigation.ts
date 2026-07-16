export const SOCIAL_PUBLISHING_OBJECTIVE
  = 'Plan, create, approve, schedule, publish, and measure organic social content for each client from one workflow.'

export type SocialPublishingRouteKey
  = | 'accounts'
    | 'calendar'
    | 'compose'
    | 'news'
    | 'feed'
    | 'approvals'
    | 'planner'
    | 'queue'
    | 'wall'
    | 'analytics'

/**
 * Enterprise suite sections (Agorapulse/Sprout-class). The tile nav renders
 * these in order: Create → Schedule → Review → Connect → Measure.
 */
export type SocialPublishingRouteGroupKey
  = | 'create'
    | 'schedule'
    | 'review'
    | 'connect'
    | 'measure'

/** Keys of the live counts surfaced as nav badges (see nav-counts endpoint). */
export type SocialPublishingNavCountKey
  = | 'accounts'
    | 'scheduled'
    | 'pendingApprovals'
    | 'drafts'
    | 'campaigns'

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
  /** When set, the tile shows this live count as a badge. */
  badgeKey?: SocialPublishingNavCountKey
}

export const SOCIAL_PUBLISHING_ROUTE_GROUPS: SocialPublishingRouteGroup[] = [
  {
    key: 'create',
    label: 'Create'
  },
  {
    key: 'schedule',
    label: 'Schedule'
  },
  {
    key: 'review',
    label: 'Review'
  },
  {
    key: 'connect',
    label: 'Connect'
  },
  {
    key: 'measure',
    label: 'Measure'
  }
]

/**
 * Canonical flat order: accounts → calendar → compose → news → feed → approvals → planner →
 * queue → wall → analytics. This drives the global agency sidebar (via
 * socialSuiteNavigation) and the step indicator, so it is intentionally kept
 * setup-first and stable. The in-page tile nav re-presents these by the five
 * suite groups below (Create → Schedule → Review → Connect → Measure) — group
 * order lives in SOCIAL_PUBLISHING_ROUTE_GROUPS, not in this array.
 */
export const SOCIAL_PUBLISHING_ROUTE_ORDER: SocialPublishingRouteItem[] = [
  {
    key: 'accounts',
    group: 'connect',
    label: 'Accounts',
    icon: 'i-lucide-plug',
    to: '/agency/social/publishing/accounts',
    objective: 'Connect the client publishing pages and profiles before posts are scheduled.',
    badgeKey: 'accounts'
  },
  {
    key: 'calendar',
    group: 'schedule',
    label: 'Calendar',
    icon: 'i-lucide-calendar-days',
    to: '/agency/social/publishing/calendar',
    objective: 'Use the calendar as the hub for planning, reviewing, and opening scheduled posts.',
    badgeKey: 'scheduled'
  },
  {
    key: 'compose',
    group: 'create',
    label: 'Compose',
    icon: 'i-lucide-pen-square',
    to: '/agency/social/publishing/compose',
    objective: 'Create one base post, customize it per network, and choose publish timing.',
    badgeKey: 'drafts'
  },
  {
    key: 'news',
    group: 'create',
    label: 'News Inbox',
    icon: 'i-lucide-newspaper',
    to: '/agency/social/publishing/news',
    objective: 'Cherry-pick MCP news, optionally rewrite it with AI, and target connected client accounts.'
  },
  {
    key: 'feed',
    group: 'create',
    label: 'Auto Feed',
    icon: 'i-lucide-car',
    to: '/agency/social/publishing/feed',
    objective: 'Browse vehicle-feed items from linked dealer clients and send them to Compose.'
  },
  {
    key: 'approvals',
    group: 'review',
    label: 'Approvals',
    icon: 'i-lucide-clipboard-check',
    to: '/agency/social/publishing/approvals',
    objective: 'Review draft posts and approve or return them before publishing.',
    badgeKey: 'pendingApprovals'
  },
  {
    key: 'planner',
    group: 'schedule',
    label: 'Planner',
    icon: 'i-lucide-calendar-clock',
    to: '/agency/social/publishing/planner',
    objective: 'Plan campaigns and campaign-owned drafts that flow into Compose, Queue, and Calendar.',
    badgeKey: 'campaigns'
  },
  {
    key: 'queue',
    group: 'schedule',
    label: 'Queue',
    icon: 'i-lucide-list-ordered',
    to: '/agency/social/publishing/queue',
    objective: 'Prioritize queued posts before they take the next available posting slot.'
  },
  {
    key: 'wall',
    group: 'measure',
    label: 'Wall',
    icon: 'i-lucide-layout-grid',
    to: '/agency/social/publishing/wall',
    objective: 'Review the managed post wall with creative, copy, accounts, status, and engagement at a glance.'
  },
  {
    key: 'analytics',
    group: 'measure',
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
