import type { NavigationMenuItem } from '@nuxt/ui'

export function searchAuthorityNavItems(
  enabled: boolean,
  close: () => void
): NavigationMenuItem[] {
  if (!enabled) return []

  return [{
    label: 'Search Authority',
    icon: 'i-lucide-search-check',
    to: '/agency/search-authority/connections',
    onSelect: close
  }]
}
