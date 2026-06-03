export const PORTAL_SOCIAL_OBJECTIVE
  = 'Review social conversations, approve replies, read reports, and track brand mentions from the client portal.'

export type PortalSocialRouteKey
  = | 'inbox'
    | 'reporting'
    | 'listening'

export interface PortalSocialRouteItem {
  key: PortalSocialRouteKey
  section: string
  label: string
  icon: string
  to: string
  exact?: boolean
  objective: string
}

export const PORTAL_SOCIAL_ROUTE_ORDER: PortalSocialRouteItem[] = [
  {
    key: 'inbox',
    section: 'Engagement',
    label: 'Social',
    icon: 'i-lucide-messages-square',
    to: '/portal/social-inbox',
    exact: true,
    objective: 'Review conversations, approvals, comments, and reviews for your connected social accounts.'
  },
  {
    key: 'reporting',
    section: 'Analytics & Reporting',
    label: 'Social Reports',
    icon: 'i-lucide-line-chart',
    to: '/portal/social-reporting',
    exact: true,
    objective: 'Read organic social performance, posting cadence, and top content results.'
  },
  {
    key: 'listening',
    section: 'Social Listening',
    label: 'Social Listening',
    icon: 'i-lucide-radar',
    to: '/portal/social-listening',
    exact: true,
    objective: 'Track brand mentions, sentiment, and topics across monitored sources.'
  }
]

export function portalSocialNavItems(onSelect: () => void) {
  return PORTAL_SOCIAL_ROUTE_ORDER.map(item => ({
    label: item.label,
    icon: item.icon,
    to: item.to,
    exact: item.exact,
    onSelect
  }))
}

export function portalSocialRouteForPath(path: string) {
  return PORTAL_SOCIAL_ROUTE_ORDER.find((item) => {
    if (item.exact) return path === item.to
    return path === item.to || path.startsWith(`${item.to}/`)
  })
}

export function portalSocialStepForPath(path: string) {
  const index = PORTAL_SOCIAL_ROUTE_ORDER.findIndex((item) => {
    if (item.exact) return path === item.to
    return path === item.to || path.startsWith(`${item.to}/`)
  })

  if (index === -1) return null

  return {
    item: PORTAL_SOCIAL_ROUTE_ORDER[index],
    position: index + 1,
    total: PORTAL_SOCIAL_ROUTE_ORDER.length
  }
}
