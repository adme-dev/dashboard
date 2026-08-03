import type { NavigationMenuItem } from '@nuxt/ui'

const SEARCH_AUTHORITY_PATH = '/agency/search-authority'

export function searchAuthorityNavItems(
  enabled: boolean,
  currentPath: string,
  close: () => void
): NavigationMenuItem[] {
  if (!enabled) return []

  return [{
    label: 'Search Authority',
    icon: 'i-lucide-search-check',
    type: 'trigger',
    defaultOpen: currentPath === SEARCH_AUTHORITY_PATH
      || currentPath.startsWith(`${SEARCH_AUTHORITY_PATH}/`),
    children: [{
      label: 'Overview',
      to: SEARCH_AUTHORITY_PATH,
      onSelect: close
    }, {
      label: 'Connections',
      to: `${SEARCH_AUTHORITY_PATH}/connections`,
      onSelect: close
    }]
  }]
}
