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
      label: 'Guides & Menu Agent',
      description: 'Evidence, governed guides, publishing and the GTM menu/feature block',
      to: SEARCH_AUTHORITY_PATH,
      onSelect: close
    }, {
      label: 'Site & publishing setup',
      description: 'Client site, publishing mode, Search Console connection',
      to: `${SEARCH_AUTHORITY_PATH}/connections`,
      onSelect: close
    }]
  }]
}
