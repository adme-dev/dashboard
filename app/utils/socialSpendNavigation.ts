export const SOCIAL_SPEND_OBJECTIVE
  = 'Connect ad platforms, sync spend, reconcile bank charges, and review paid social performance from one workflow.'

export type SocialSpendRouteKey
  = | 'connections'
    | 'spend'
    | 'meta'
    | 'google'
    | 'tiktok'
    | 'linkedin'
    | 'pinterest'
    | 'snapchat'
    | 'twitter'
    | 'microsoft_ads'

export interface SocialSpendRouteItem {
  key: SocialSpendRouteKey
  section: string
  label: string
  icon: string
  to: string
  exact?: boolean
  objective: string
}

const platformRouteItems: SocialSpendRouteItem[] = [
  {
    key: 'meta',
    section: 'Platform accounts',
    label: 'Meta Ads',
    icon: 'i-lucide-facebook',
    to: '/agency/social/meta',
    objective: 'Review Meta ad accounts, campaigns, spend, budgets, and sync status.'
  },
  {
    key: 'google',
    section: 'Platform accounts',
    label: 'Google Ads',
    icon: 'i-lucide-chrome',
    to: '/agency/social/google',
    objective: 'Review Google Ads accounts, campaigns, spend, budgets, and sync status.'
  },
  {
    key: 'tiktok',
    section: 'Platform accounts',
    label: 'TikTok Ads',
    icon: 'i-lucide-music',
    to: '/agency/social/tiktok',
    objective: 'Review TikTok Ads accounts, campaigns, spend, budgets, and sync status.'
  },
  {
    key: 'linkedin',
    section: 'Platform accounts',
    label: 'LinkedIn Ads',
    icon: 'i-lucide-linkedin',
    to: '/agency/social/linkedin',
    objective: 'Review LinkedIn Ads accounts, campaigns, spend, budgets, and sync status.'
  },
  {
    key: 'pinterest',
    section: 'Platform accounts',
    label: 'Pinterest Ads',
    icon: 'i-lucide-pin',
    to: '/agency/social/pinterest',
    objective: 'Review Pinterest Ads accounts, campaigns, spend, budgets, and sync status.'
  },
  {
    key: 'snapchat',
    section: 'Platform accounts',
    label: 'Snapchat Ads',
    icon: 'i-lucide-ghost',
    to: '/agency/social/snapchat',
    objective: 'Review Snapchat Ads accounts, campaigns, spend, budgets, and sync status.'
  },
  {
    key: 'twitter',
    section: 'Platform accounts',
    label: 'X Ads',
    icon: 'i-lucide-at-sign',
    to: '/agency/social/twitter',
    objective: 'Review X Ads accounts, campaigns, spend, budgets, and sync status.'
  },
  {
    key: 'microsoft_ads',
    section: 'Platform accounts',
    label: 'Microsoft Ads',
    icon: 'i-lucide-search',
    to: '/agency/social/microsoft_ads',
    objective: 'Review Microsoft Ads accounts, campaigns, spend, budgets, and sync status.'
  }
]

export const SOCIAL_SPEND_PLATFORM_ROUTES = platformRouteItems

export const SOCIAL_SPEND_ROUTE_ORDER: SocialSpendRouteItem[] = [
  {
    key: 'connections',
    section: 'Setup',
    label: 'Connections',
    icon: 'i-lucide-plug',
    to: '/agency/social',
    exact: true,
    objective: 'Connect paid social ad accounts and confirm account health before syncing spend.'
  },
  {
    key: 'spend',
    section: 'Spend review',
    label: 'Ad Spend',
    icon: 'i-lucide-wallet',
    to: '/agency/social/spend',
    exact: true,
    objective: 'Review monthly spend, budgets, bank charges, commission, and platform variance.'
  },
  ...platformRouteItems
]

export const SOCIAL_SPEND_WORKFLOW_ROUTES = SOCIAL_SPEND_ROUTE_ORDER.filter(item =>
  item.key === 'connections' || item.key === 'spend'
)

export function socialSpendSuiteNavItems(onSelect: () => void) {
  return [
    { type: 'label' as const, label: 'Paid Social' },
    ...SOCIAL_SPEND_ROUTE_ORDER.map(item => ({
      label: item.label,
      icon: item.icon,
      to: item.to,
      exact: item.exact,
      onSelect
    }))
  ]
}

export function socialSpendRouteForPath(path: string) {
  return SOCIAL_SPEND_ROUTE_ORDER.find((item) => {
    if (item.exact) return path === item.to
    return path === item.to || path.startsWith(`${item.to}/`)
  })
}

export function socialSpendStepForPath(path: string) {
  const index = SOCIAL_SPEND_ROUTE_ORDER.findIndex((item) => {
    if (item.exact) return path === item.to
    return path === item.to || path.startsWith(`${item.to}/`)
  })

  if (index === -1) return null

  return {
    item: SOCIAL_SPEND_ROUTE_ORDER[index],
    position: index + 1,
    total: SOCIAL_SPEND_ROUTE_ORDER.length
  }
}
