import { readFileSync } from 'node:fs'
import type { NavigationMenuItem } from '@nuxt/ui'
import { parseQuery } from 'vue-router'
import { describe, expect, it } from 'vitest'
import {
  applyActiveSidebarNav,
  applyActiveSidebarNavGroup,
  applyMediaProjectSidebarContext,
  canonicalizeMatchedSidebarPath,
  collapsedPopoverKey,
  parseInternalNavTarget,
  resolveActiveSidebarNavItem,
  resolveLoadedMediaProjectContext,
  type SidebarMatchedRecord
} from '~~/app/utils/sidebarActiveNav'
import { searchAuthorityNavItems } from '~~/app/utils/searchAuthorityNavigation'
import { socialSpendSuiteNavItems } from '~~/app/utils/socialSpendNavigation'
import { socialSuiteNavItems } from '~~/app/utils/socialSuiteNavigation'

function collectActiveItems(groups: readonly (readonly NavigationMenuItem[])[]): NavigationMenuItem[] {
  const active: NavigationMenuItem[] = []
  const visit = (items: readonly NavigationMenuItem[]) => {
    for (const item of items) {
      if (item.active) active.push(item)
      if (item.children?.length) visit(item.children)
    }
  }
  for (const group of groups) visit(group)
  return active
}

function collectNavigableItems(groups: readonly (readonly NavigationMenuItem[])[]): NavigationMenuItem[] {
  const navigable: NavigationMenuItem[] = []
  const visit = (items: readonly NavigationMenuItem[]) => {
    for (const item of items) {
      if (item.type !== 'label' && item.to && !item.disabled && !item.external && (!item.target || item.target === '_self') && !(item.type === 'trigger' && item.children?.length)) {
        navigable.push(item)
      }
      if (item.children?.length) visit(item.children)
    }
  }
  for (const group of groups) visit(group)
  return navigable
}

function routeFromUrl(url: string, matched?: readonly SidebarMatchedRecord[]) {
  const parsed = new URL(url, 'http://xeroflow.local')
  return {
    path: parsed.pathname,
    query: parseQuery(parsed.search),
    ...(matched ? { matched } : {})
  }
}

function buildFullAgencySidebarGroups(): NavigationMenuItem[][] {
  const noop = () => {}
  const workspaceNav: NavigationMenuItem[] = [
    {
      label: 'Client Delivery',
      to: '/agency/w/client-delivery',
      children: [
        { label: 'Marketing Board', to: '/agency/boards/marketing', onSelect: noop },
        { label: 'Design Board', to: '/agency/boards/design', onSelect: noop }
      ]
    }
  ]

  const mainNav: NavigationMenuItem[] = [
    { type: 'label', label: 'Main' },
    { label: 'Dashboard', to: '/agency', exact: true },
    { label: 'Inbox', to: '/agency/inbox' },
    { label: 'All Boards', to: '/agency/boards' },

    { type: 'label', label: 'Work Management' },
    { label: 'Workflow', to: '/agency/workflow' },
    { label: 'Timeline', to: '/agency/workflow/timeline' },
    { label: 'Tasks', to: '/agency/tasks' },

    { type: 'label', label: 'Projects' },
    { label: 'Projects', to: '/agency/projects' },
    { label: 'Briefs', to: '/agency/briefs' },
    { label: 'Templates', to: '/agency/templates' },
    { label: 'Proofs', to: '/agency/proofs' },

    { type: 'label', label: 'Operations' },
    { label: 'Job Operations', to: '/agency/operations/jobs' },
    { label: 'Client Billing', to: '/agency/operations/billing' },

    { type: 'label', label: 'Clients' },
    { label: 'Clients', to: '/agency/clients' },
    { label: 'CRM', to: '/agency/crm' },
    { label: 'Intake', to: '/agency/intake' },
    { label: 'Client Portal', to: '/agency/client-portal' },

    { type: 'label', label: 'Websites' },
    { label: 'Client websites', to: '/agency/page-studio' },
    { label: 'Bookings', to: '/agency/page-studio/bookings' },
    { label: 'Reviews', to: '/agency/page-studio/reviews' },
    { label: 'Releases', to: '/agency/page-studio/releases' },
    { label: 'Domains & DNS', to: '/agency/page-studio/domains' },
    { label: 'Subscriptions', to: '/agency/page-studio/subscriptions' },
    { label: 'Website preparations', to: '/agency/page-studio/transfer-requests' },

    { type: 'label', label: 'Time & Capacity' },
    { label: 'Time Tracking', to: '/agency/time' },
    { label: 'Approvals', to: '/agency/time/approvals' },
    { label: 'Time Reports', to: '/agency/time/reports' },
    { label: 'Capacity', to: '/agency/capacity' },
    { label: 'Department Goals', to: '/agency/hr/goals' },
    { label: 'HR Benchmark Registry', to: '/agency/hr/benchmarks' },
    { label: 'HR Contract Vault', to: '/agency/hr/contracts' },
    { label: 'HR Launch Governance', to: '/agency/hr/governance' },
    { label: 'Monday Evidence Scope', to: '/agency/hr/monday' },
    { label: 'Monday Evidence Preview', to: '/agency/hr/monday/evidence' },
    { label: 'Monday Governed Import', to: '/agency/hr/monday/import' },

    { type: 'label', label: 'Budget Tracker' },
    { label: 'Analytics', to: '/agency/analytics' },
    { label: 'Budget Health', to: '/agency/budget-health' },
    { label: 'Site Tracking', to: '/agency/tracking' },

    { type: 'label', label: 'Social' },
    ...socialSpendSuiteNavItems(noop),
    { label: 'Dealer Feeds', to: '/agency/dealer-feeds' },
    ...socialSuiteNavItems(noop),

    { type: 'label', label: 'Search & Content' },
    ...searchAuthorityNavItems(true, '/agency/search-authority', noop),

    { type: 'label', label: 'Leads' },
    { label: 'Lead Inbox', to: '/agency/leads' },
    { label: 'Email Marketing', to: '/agency/email' },

    { type: 'label', label: 'Finance' },
    { label: 'Billing', to: '/agency/billing' },
    { label: 'Expenses', to: '/agency/expenses' },
    { label: 'Retainers', to: '/agency/retainers' },
    { label: 'Financial Health', to: '/agency/financial-health' },

    { type: 'label', label: 'Sales' },
    { label: 'Sales', to: '/agency/sales' },
    { label: 'Quotes', to: '/agency/sales/quotes' },
    { label: 'Pricing', to: '/agency/sales/pricing' },
    { label: 'Rate Card', to: '/agency/rate-cards' },
    { label: 'Price Templates', to: '/agency/sales/templates' },

    { type: 'label', label: 'Reports' },
    { label: 'Reports', to: '/agency/reports' },
    { label: 'Project Health', to: '/agency/health' },
    { label: 'Alerts', to: '/agency/alerts' },

    { type: 'label', label: 'XeroFlow' },
    { label: 'Xero Dashboard', to: '/xeroflow' },
    { label: 'Get Out', to: '/xeroflow/get-out' },
    { label: 'CFO Dashboard', to: '/xeroflow/cfo' },
    { label: 'Customers', to: '/customers' },
    { label: 'Xero Invoices', to: '/invoices' },
    { label: 'Invoice Builder', to: '/xeroflow/invoice-builder' },
    { label: 'Xero Expenses', to: '/expenses' },
    { label: 'Cash Flow', to: '/cashflow' },
    { label: 'Profit & Loss', to: '/profit-loss' },
    { label: 'Financial Reports', to: '/reports' },
    { label: 'Advisor Backlog', to: '/advisor' },
    { label: 'Insights', to: '/insights' },
    { label: 'Anomalies', to: '/anomalies' },
    { label: 'Recommendations', to: '/recommendations' },
    { label: 'Finance AI', to: '/agency/ai/finance' },

    { type: 'label', label: 'Team' },
    { label: 'Team Members', to: '/agency/team' },
    { label: 'Teams', to: '/agency/teams' },
    { label: 'HR Business Review', to: '/agency/hr' },

    { type: 'label', label: 'Tools' },
    { label: 'AI Chat', to: '/agency/ai/chat', exact: true },
    { label: 'My Assistant', to: '/agency/ai/my-assistant' },
    { label: 'Skills and Sources', to: '/agency/ai/skills' },
    { label: 'Voice AI', to: '/agency/ai/chat?mode=voice', exact: true },
    { label: 'AI Reports', to: '/agency/ai/reports' },
    { label: 'Connect AI Assistants', to: '/agency/ai/connectors' },
    { label: 'QR Codes', to: '/agency/qr-codes' },
    { label: 'AI Settings', to: '/agency/ai/settings' },
    { label: 'Knowledge Base', to: '/agency/ai/knowledge' },
    { label: 'AI Training', to: '/agency/ai/training' },
    { label: 'Automation', to: '/agency/automation' },
    { label: 'Escalations', to: '/agency/automation/escalations' },

    { type: 'label', label: 'Creative' },
    { label: 'Creative Suite', to: 'https://creative.xeroflow.io', target: '_blank', rel: 'noopener noreferrer' },
    { label: 'Banner Studio', to: '/agency/banner-studio' },
    { label: 'Templates', to: '/agency/banner-studio/templates' },
    { label: 'Brand Kits', to: '/agency/banner-studio/brand-kits' },
    { label: 'Upload Banners', to: '/agency/banner-studio/upload' },
    { label: 'Audio Studio', to: '/agency/audio' },
    { label: 'Video Studio', to: '/agency/audio/projects?mediaType=av' },
    { label: 'Audio Projects', to: '/agency/audio/projects' },
    { label: 'Ad Preview', to: '/agency/ad-preview' },
    { label: 'Bulk Ad Launch', to: '/agency/ad-publish' },

    { type: 'label', label: 'Collaboration' },
    { label: 'Chat', to: '/agency/chat' },
    { label: 'Office', to: '/office' }
  ]

  const footerNav: NavigationMenuItem[] = [
    {
      label: 'Monday',
      children: [
        { label: 'Migration', to: '/agency/monday' },
        { label: 'Migrate Data', to: '/agency/monday/migrate' },
        { label: 'Items', to: '/agency/monday/items' },
        { label: 'User Sync', to: '/agency/monday/users' }
      ]
    },
    {
      label: 'Admin',
      children: [
        { label: 'User Management', to: '/admin/users' },
        { label: 'Teams', to: '/admin/teams' },
        { label: 'Roles & Permissions', to: '/admin/permissions' },
        { label: 'Integrations', to: '/admin/connections/integrations' },
        { label: 'AI & MCP', to: '/admin/ai/mcp' }
      ]
    },
    {
      label: 'Settings',
      children: [
        { label: 'Agency Settings', to: '/agency/settings' },
        { label: 'General', to: '/settings', exact: true },
        { label: 'Members', to: '/settings/members' },
        { label: 'Notifications', to: '/settings/notifications' },
        { label: 'Watching', to: '/agency/notifications/watching' },
        { label: 'Security', to: '/settings/security' },
        { label: 'AI Governance', to: '/admin/ai/governance' },
        { label: 'AI Model Ops', to: '/admin/ai/model-ops' },
        { label: 'CRM Search Operations', to: '/admin/ai/crm-search' },
        { label: 'Admin', to: '/settings/admin' },
        { label: 'Integrations', to: '/settings/integrations/monday' }
      ]
    }
  ]

  return [workspaceNav, mainNav, footerNav]
}

describe('sidebarActiveNav', () => {
  it('parses internal string and object targets and ignores external URLs', () => {
    expect(parseInternalNavTarget('/agency/audio/projects?mediaType=av')).toEqual({
      path: '/agency/audio/projects',
      query: [['mediaType', 'av']]
    })
    expect(parseInternalNavTarget('/agency/audio/')).toEqual({
      path: '/agency/audio',
      query: []
    })
    expect(parseInternalNavTarget({ path: '/agency/ai/chat', query: { mode: 'voice' } })).toEqual({
      path: '/agency/ai/chat',
      query: [['mode', 'voice']]
    })
    expect(parseInternalNavTarget('https://creative.xeroflow.io')).toBeNull()
    expect(parseInternalNavTarget('mailto:support@xeroflow.io')).toBeNull()
  })

  it('activates only Video Studio on /agency/audio/projects?mediaType=av and only Audio Projects without mediaType=av', () => {
    const groups = buildFullAgencySidebarGroups()

    const onVideoStudio = applyActiveSidebarNav(groups, routeFromUrl('/agency/audio/projects?mediaType=av'))
    expect(collectActiveItems(onVideoStudio).map(i => i.label)).toEqual(['Video Studio'])

    const onVideoStudioWithExtraQuery = applyActiveSidebarNav(groups, routeFromUrl('/agency/audio/projects?mediaType=av&view=list'))
    expect(collectActiveItems(onVideoStudioWithExtraQuery).map(i => i.label)).toEqual(['Video Studio'])

    const onAudioProjects = applyActiveSidebarNav(groups, routeFromUrl('/agency/audio/projects'))
    expect(collectActiveItems(onAudioProjects).map(i => i.label)).toEqual(['Audio Projects'])

    const onAudioFiltered = applyActiveSidebarNav(groups, routeFromUrl('/agency/audio/projects?mediaType=audio'))
    expect(collectActiveItems(onAudioFiltered).map(i => i.label)).toEqual(['Audio Projects'])

    const onAudioStudio = applyActiveSidebarNav(groups, routeFromUrl('/agency/audio'))
    expect(collectActiveItems(onAudioStudio).map(i => i.label)).toEqual(['Audio Studio'])

    const onProjectDetail = applyActiveSidebarNav(groups, routeFromUrl('/agency/audio/projects/proj-123'))
    expect(collectActiveItems(onProjectDetail).map(i => i.label)).toEqual(['Audio Projects'])

    const onVideoProjectDetail = applyActiveSidebarNav(groups, routeFromUrl('/agency/audio/projects/proj-123?mediaType=av'))
    expect(collectActiveItems(onVideoProjectDetail).map(i => i.label)).toEqual(['Video Studio'])
  })

  it('activates only Voice AI or only AI Chat on /agency/ai/chat routes and clears aria-current on the loser', () => {
    const groups = buildFullAgencySidebarGroups()

    const onVoice = applyActiveSidebarNav(groups, routeFromUrl('/agency/ai/chat?mode=voice'))
    const voiceActive = collectActiveItems(onVoice)
    expect(voiceActive.map(i => i.label)).toEqual(['Voice AI'])
    expect(voiceActive[0]?.['aria-current']).toBe('page')

    const mainItems = onVoice[1]!
    const aiChat = mainItems.find(i => i.label === 'AI Chat')
    expect(aiChat?.active).toBe(false)
    expect(aiChat?.exact).toBe(false)
    expect(aiChat?.['aria-current']).toBeUndefined()

    const onVoiceWithConversation = applyActiveSidebarNav(groups, routeFromUrl('/agency/ai/chat?mode=voice&conversation=42'))
    expect(collectActiveItems(onVoiceWithConversation).map(i => i.label)).toEqual(['Voice AI'])

    const onChat = applyActiveSidebarNav(groups, routeFromUrl('/agency/ai/chat'))
    expect(collectActiveItems(onChat).map(i => i.label)).toEqual(['AI Chat'])

    const onChatWithConversation = applyActiveSidebarNav(groups, routeFromUrl('/agency/ai/chat?conversation=42'))
    expect(collectActiveItems(onChatWithConversation).map(i => i.label)).toEqual(['AI Chat'])
  })

  it.each([
    ['/agency', 'Dashboard'],
    ['/agency/boards', 'All Boards'],
    ['/agency/boards/marketing', 'Marketing Board'],
    ['/agency/boards/unlisted-board', 'All Boards'],
    ['/agency/workflow', 'Workflow'],
    ['/agency/workflow/timeline', 'Timeline'],
    ['/agency/page-studio', 'Client websites'],
    ['/agency/page-studio/bookings', 'Bookings'],
    ['/agency/page-studio/site-42/content', 'Client websites'],
    ['/agency/time', 'Time Tracking'],
    ['/agency/time/approvals', 'Approvals'],
    ['/agency/time/reports', 'Time Reports'],
    ['/agency/hr', 'HR Business Review'],
    ['/agency/hr/reviews/participants/p-1/findings', 'HR Business Review'],
    ['/agency/hr/monday', 'Monday Evidence Scope'],
    ['/agency/hr/monday/evidence', 'Monday Evidence Preview'],
    ['/agency/hr/monday/import', 'Monday Governed Import'],
    ['/agency/social', 'Connections'],
    ['/agency/social/spend', 'Ad Spend'],
    ['/agency/social/google/ai-max', 'Google Ads'],
    ['/agency/social/google/pmax-launches', 'Google Ads'],
    ['/agency/social/inbox', 'Inbox'],
    ['/agency/social/inbox/wall', 'Wall'],
    ['/agency/search-authority', 'Guides & Menu Agent'],
    ['/agency/search-authority/connections', 'Site & publishing setup'],
    ['/agency/search-authority/content/guide-1', 'Guides & Menu Agent'],
    ['/agency/sales', 'Sales'],
    ['/agency/sales/quotes', 'Quotes'],
    ['/agency/sales/quotes/new', 'Quotes'],
    ['/agency/sales/quotes/q-1/edit', 'Quotes'],
    ['/agency/sales/pricing', 'Pricing'],
    ['/agency/team', 'Team Members'],
    ['/agency/teams', 'Teams'],
    ['/agency/automation', 'Automation'],
    ['/agency/automation/rule-9', 'Automation'],
    ['/agency/automation/escalations', 'Escalations'],
    ['/agency/banner-studio', 'Banner Studio'],
    ['/agency/banner-studio/upload', 'Upload Banners'],
    ['/agency/banner-studio/templates', 'Templates'],
    ['/agency/banner-studio/brand-kits', 'Brand Kits'],
    ['/agency/banner-studio/banner-7', 'Banner Studio'],
    ['/agency/banner-studio/banner-7/variants', 'Banner Studio'],
    ['/agency/banner-studio/custom/tpl-3', 'Banner Studio'],
    ['/agency/monday', 'Migration'],
    ['/agency/monday/migrate', 'Migrate Data'],
    ['/agency/monday/items', 'Items'],
    ['/agency/monday/users', 'User Sync'],
    ['/agency/monday/migrations/mig-1', 'Migration'],
    ['/settings', 'General'],
    ['/settings/members', 'Members'],
    ['/xeroflow', 'Xero Dashboard'],
    ['/xeroflow/get-out', 'Get Out'],
    ['/xeroflow/cfo', 'CFO Dashboard'],
    ['/xeroflow/invoice-builder', 'Invoice Builder']
  ])('highlights strictly one item for %s -> %s', (url, expectedLabel) => {
    const groups = buildFullAgencySidebarGroups()
    const resolved = applyActiveSidebarNav(groups, routeFromUrl(url))
    const active = collectActiveItems(resolved)

    expect(active).toHaveLength(1)
    expect(active[0]?.label).toBe(expectedLabel)
  })

  it('respects segment boundaries so sibling prefixes never falsely match', () => {
    const groups = buildFullAgencySidebarGroups()

    expect(resolveActiveSidebarNavItem(groups, routeFromUrl('/agency/monday-cutover'))).toBeNull()
    expect(resolveActiveSidebarNavItem(groups, routeFromUrl('/agency/profitability'))).toBeNull()
  })

  it('guarantees every single sidebar item in the agency nav activates strictly itself and nothing else', () => {
    const groups = buildFullAgencySidebarGroups()
    const navigable = collectNavigableItems(groups)

    expect(navigable.length).toBeGreaterThan(80)

    for (const item of navigable) {
      const to = String(item.to)
      const resolved = applyActiveSidebarNav(groups, routeFromUrl(to))
      const active = collectActiveItems(resolved)

      expect(active, `Expected exactly 1 active item for ${item.label} (${to})`).toHaveLength(1)
      expect(active[0]?.to).toBe(item.to)
      expect(active[0]?.label).toBe(item.label)
    }
  })

  it('handles portal default query routes and accordion triggers without double-activating', () => {
    const portalNav: NavigationMenuItem[] = [
      { label: 'Dashboard', to: '/portal', exact: true },
      { label: 'Websites', to: '/portal/page-studio' },
      { label: 'Domains & DNS', to: '/portal/page-studio/domains' },
      { label: 'Release history', to: '/portal/page-studio/releases' },
      { label: 'Jobs', to: '/portal/projects?status=active' },
      {
        label: 'Analytics',
        to: '/portal/analytics?metric=leads',
        type: 'trigger',
        children: [
          { label: 'Overview', to: '/portal/analytics?metric=leads' },
          { label: 'Google', to: '/portal/analytics/google' }
        ]
      }
    ]

    expect(collectActiveItems([applyActiveSidebarNavGroup(portalNav, routeFromUrl('/portal/page-studio/domains'))]).map(i => i.label)).toEqual(['Domains & DNS'])
    expect(collectActiveItems([applyActiveSidebarNavGroup(portalNav, routeFromUrl('/portal/page-studio/site-1/content'))]).map(i => i.label)).toEqual(['Websites'])
    expect(collectActiveItems([applyActiveSidebarNavGroup(portalNav, routeFromUrl('/portal/projects/proj-9'))]).map(i => i.label)).toEqual(['Jobs'])
    expect(collectActiveItems([applyActiveSidebarNavGroup(portalNav, routeFromUrl('/portal/projects?status=completed'))]).map(i => i.label)).toEqual(['Jobs'])
    expect(collectActiveItems([applyActiveSidebarNavGroup(portalNav, routeFromUrl('/portal/analytics?metric=leads'))]).map(i => i.label)).toEqual(['Overview'])
    expect(collectActiveItems([applyActiveSidebarNavGroup(portalNav, routeFromUrl('/portal/analytics/google'))]).map(i => i.label)).toEqual(['Google'])

    // Collapsed mode promotes the active indicator to the visible top-level Analytics link
    // because Overview/Google children are unmounted when the sidebar collapses.
    const collapsedAnalytics = applyActiveSidebarNavGroup(portalNav, routeFromUrl('/portal/analytics?metric=leads'), { collapsed: true })
    const analyticsGroup = collapsedAnalytics.find(i => i.label === 'Analytics')
    expect(analyticsGroup?.active).toBe(true)
    expect(analyticsGroup?.['aria-current']).toBe('page')

    const collapsedGoogle = applyActiveSidebarNavGroup(portalNav, routeFromUrl('/portal/analytics/google'), { collapsed: true })
    const analyticsOnGoogle = collapsedGoogle.find(i => i.label === 'Analytics')
    expect(analyticsOnGoogle?.active).toBe(true)
    expect(analyticsOnGoogle?.['aria-current']).toBe('page')
  })

  it('canonicalizes mixed-case static route segments while preserving dynamic parameter casing', () => {
    const groups = buildFullAgencySidebarGroups()

    expect(canonicalizeMatchedSidebarPath('/agency/AUDIO/projects', [{ path: '/agency' }, { path: '/agency/audio/projects' }]))
      .toBe('/agency/audio/projects')
    expect(canonicalizeMatchedSidebarPath('/agency/BOARDS/Marketing', [{ path: '/agency' }, { path: '/agency/boards/:id()' }]))
      .toBe('/agency/boards/Marketing')

    // Mixed-case static segments still highlight Video Studio
    const mixedCaseVideo = applyActiveSidebarNav(
      groups,
      routeFromUrl('/agency/AUDIO/projects?mediaType=av', [{ path: '/agency' }, { path: '/agency/audio/projects' }])
    )
    expect(collectActiveItems(mixedCaseVideo).map(i => i.label)).toEqual(['Video Studio'])

    // Mixed-case static segment with lowercase board slug matches the workspace board
    const lowerSlug = applyActiveSidebarNav(
      groups,
      routeFromUrl('/agency/BOARDS/marketing', [{ path: '/agency' }, { path: '/agency/boards/:id()' }])
    )
    expect(collectActiveItems(lowerSlug).map(i => i.label)).toEqual(['Marketing Board'])

    // Distinct casing on dynamic board slug stays distinct from `marketing` and falls back to All Boards
    const upperSlug = applyActiveSidebarNav(
      groups,
      routeFromUrl('/agency/BOARDS/Marketing', [{ path: '/agency' }, { path: '/agency/boards/:id()' }])
    )
    expect(collectActiveItems(upperSlug).map(i => i.label)).toEqual(['All Boards'])
  })

  it('matches scalar page semantics when query keys are repeated', () => {
    const groups = buildFullAgencySidebarGroups()

    // Vue Router parses repeated keys as arrays; pages check `route.query.mediaType === 'av'`
    // (which is false for arrays, rendering the unfiltered project list).
    const repeatedMediaType = applyActiveSidebarNav(groups, routeFromUrl('/agency/audio/projects?mediaType=av&mediaType=audio'))
    expect(collectActiveItems(repeatedMediaType).map(i => i.label)).toEqual(['Audio Projects'])

    const duplicateAv = applyActiveSidebarNav(groups, routeFromUrl('/agency/audio/projects?mediaType=av&mediaType=av'))
    expect(collectActiveItems(duplicateAv).map(i => i.label)).toEqual(['Audio Projects'])

    const repeatedVoiceMode = applyActiveSidebarNav(groups, routeFromUrl('/agency/ai/chat?mode=voice&mode=text'))
    expect(collectActiveItems(repeatedVoiceMode).map(i => i.label)).toEqual(['AI Chat'])
  })

  it('highlights Video Studio on direct bare video-editor URLs once the loaded media type is known', () => {
    const groups = buildFullAgencySidebarGroups()
    const matched = [{ path: '/agency' }, { path: '/agency/audio/projects/:id()' }]

    // Before the project finishes loading, bare URL falls back to Audio Projects.
    const beforeLoad = applyMediaProjectSidebarContext(routeFromUrl('/agency/audio/projects/av-42', matched), null)
    expect(collectActiveItems(applyActiveSidebarNav(groups, beforeLoad)).map(i => i.label)).toEqual(['Audio Projects'])

    // Once the editor loads an AV project, Video Studio highlights (including mixed-case static segments).
    const afterAvLoad = applyMediaProjectSidebarContext(
      routeFromUrl('/agency/AUDIO/PROJECTS/av-42', matched),
      { projectId: 'av-42', mediaType: 'av' }
    )
    expect(collectActiveItems(applyActiveSidebarNav(groups, afterAvLoad)).map(i => i.label)).toEqual(['Video Studio'])

    // Mismatched query on an audio project corrects to Audio Projects once loaded.
    const afterAudioLoad = applyMediaProjectSidebarContext(
      routeFromUrl('/agency/audio/projects/aud-9?mediaType=av', matched),
      { projectId: 'aud-9', mediaType: 'audio' }
    )
    expect(collectActiveItems(applyActiveSidebarNav(groups, afterAudioLoad)).map(i => i.label)).toEqual(['Audio Projects'])

    // Context for another project never leaks across project IDs or back to the list route.
    const wrongId = applyMediaProjectSidebarContext(
      routeFromUrl('/agency/audio/projects/other-1', matched),
      { projectId: 'av-42', mediaType: 'av' }
    )
    expect(collectActiveItems(applyActiveSidebarNav(groups, wrongId)).map(i => i.label)).toEqual(['Audio Projects'])

    const backToList = applyMediaProjectSidebarContext(
      routeFromUrl('/agency/audio/projects', [{ path: '/agency' }, { path: '/agency/audio/projects' }]),
      { projectId: 'av-42', mediaType: 'av' }
    )
    expect(collectActiveItems(applyActiveSidebarNav(groups, backToList)).map(i => i.label)).toEqual(['Audio Projects'])

    // Loaded metadata helper resolves project ID and mediaType directly without engine readiness.
    expect(resolveLoadedMediaProjectContext({ id: 'av-42', mediaType: 'av' }, null)).toEqual({
      projectId: 'av-42',
      mediaType: 'av'
    })
    expect(resolveLoadedMediaProjectContext({ id: 'aud-9', mediaType: null }, 'audio')).toEqual({
      projectId: 'aud-9',
      mediaType: 'audio'
    })
    expect(resolveLoadedMediaProjectContext(null, 'av')).toBeNull()
  })

  it('transfers collapsed active highlight from workspace rail ancestor to board child when flyout opens', () => {
    const groups = buildFullAgencySidebarGroups()
    const location = routeFromUrl('/agency/boards/marketing', [{ path: '/agency' }, { path: '/agency/boards/:id()' }])
    const workspaceKey = collapsedPopoverKey(0, 0)

    const closed = applyActiveSidebarNav(groups, location, {
      collapsed: true,
      popover: true,
      openPopoverKeys: new Set()
    })
    const closedWorkspace = closed[0]![0]!
    expect(closedWorkspace.active).toBe(true)
    expect(closedWorkspace['aria-current']).toBe('page')

    const open = applyActiveSidebarNav(groups, location, {
      collapsed: true,
      popover: true,
      openPopoverKeys: new Set([workspaceKey])
    })
    const openWorkspace = open[0]![0]!
    expect(openWorkspace.active).toBe(false)
    expect(openWorkspace['aria-current']).toBeUndefined()
    expect(openWorkspace.children?.[0]?.active).toBe(true)
    expect(openWorkspace.children?.[0]?.['aria-current']).toBe('page')
  })

  it('handles default layout query-scoped siblings without double-activating', () => {
    const defaultNav: NavigationMenuItem[] = [
      {
        label: 'Agency',
        to: '/agency',
        type: 'trigger',
        children: [
          { label: 'Overview', to: '/agency', exact: true },
          { label: 'Billing', to: '/agency/billing' },
          { label: 'EOM Invoicing', to: '/agency/billing?tab=eom' },
          { label: 'Financial Health', to: '/agency/financial-health' },
          { label: 'Budget Health', to: '/agency/financial-health?tab=budget' },
          { label: 'Connections', to: '/agency/social' },
          { label: 'Ad Spend', to: '/agency/social/spend' }
        ]
      }
    ]

    expect(collectActiveItems([applyActiveSidebarNavGroup(defaultNav, routeFromUrl('/agency/billing'))]).map(i => i.label)).toEqual(['Billing'])
    expect(collectActiveItems([applyActiveSidebarNavGroup(defaultNav, routeFromUrl('/agency/billing?tab=eom'))]).map(i => i.label)).toEqual(['EOM Invoicing'])
    expect(collectActiveItems([applyActiveSidebarNavGroup(defaultNav, routeFromUrl('/agency/financial-health?tab=budget'))]).map(i => i.label)).toEqual(['Budget Health'])
    expect(collectActiveItems([applyActiveSidebarNavGroup(defaultNav, routeFromUrl('/agency/social/spend'))]).map(i => i.label)).toEqual(['Ad Spend'])
  })

  it('wires the single-active resolver into every dashboard sidebar layout', () => {
    for (const file of ['app/layouts/agency.vue', 'app/layouts/default.vue', 'app/layouts/portal.vue', 'app/layouts/admin.vue']) {
      const source = readFileSync(file, 'utf8')
      expect(source, `${file} should use sidebarActiveNav`).toMatch(/applyActiveSidebarNav(?:Group)?/)
    }
  })
})
