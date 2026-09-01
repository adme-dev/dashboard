<script setup lang="ts">
import type { CommandPaletteGroup, CommandPaletteItem, NavigationMenuItem } from '@nuxt/ui'
import { socialSpendSuiteNavItems } from '~/utils/socialSpendNavigation'
import { socialSuiteNavItems } from '~/utils/socialSuiteNavigation'
import { searchAuthorityNavItems } from '~/utils/searchAuthorityNavigation'
import { useAuthenticatedFetch } from '~/composables/useAuthenticatedFetch'

const route = useRoute()
const runtimeConfig = useRuntimeConfig()
const open = ref(false)
const selectedWorkspace = ref<string | null>(null)
const isClientAnalyticsRoute = computed(() => route.path.startsWith('/agency/analytics/client/'))
const { fetch: layoutFetch } = useAuthenticatedFetch()

// The Activity Hub floating bubble is hidden on the full-screen Chat surface —
// it duplicates chat and overlaps the bottom-anchored message composer.
const showActivityHub = computed(() => !route.path.startsWith('/agency/chat'))

// RBAC: permission-gated navigation
const {
  isReadOnly,
  canAccessClients,
  canAccessMediaBuying,
  canAccessFinance,
  canAccessInvoices,
  canAccessSales,
  canAccessReports,
  canAccessCreative,
  canAccessAdmin,
  canAccessHr,
  canAccessAiTraining,
  canAccessAutomation,
  hasPermission
} = useAuth()

const close = () => {
  open.value = false
}

// A read-only account whose ONLY capability is media buying (e.g. the Meta App
// Review reviewer account) gets a stripped-down sidebar showing just Ad Spend.
// It must not browse clients, boards, financials, leads, settings, etc. Any
// normal staff role (members, real media buyers — none of which are read-only)
// is unaffected; this matches only the read-only spend-reviewer profile.
const isSpendOnlyReviewer = computed(() =>
  isReadOnly.value
  && canAccessMediaBuying.value
  && !canAccessClients.value
  && !canAccessFinance.value
  && !canAccessInvoices.value
  && !canAccessSales.value
  && !canAccessCreative.value
  && !canAccessReports.value
  && !canAccessAdmin.value
)

// Fetch workspaces
interface AgencyWorkspaceBoard {
  name: string
  slug: string
  taskCount: number
}

interface AgencyWorkspace {
  id: string
  name: string
  slug: string
  icon?: string | null
  stats?: {
    boards?: number | null
  } | null
  boards?: AgencyWorkspaceBoard[] | null
}

interface AgencyWorkspacesResponse {
  workspaces?: AgencyWorkspace[]
}

const workspaces = ref<AgencyWorkspace[]>([])

async function loadWorkspaces() {
  try {
    const data = await layoutFetch<AgencyWorkspacesResponse>('/api/agency/workspaces')
    workspaces.value = data.workspaces || []
  } catch {
    workspaces.value = []
  }
}
onMounted(loadWorkspaces)

// Refetch whenever a board is created from any BoardCreateModal instance
const workspacesVersion = useState<number>('agency-workspaces-version', () => 0)
watch(workspacesVersion, loadWorkspaces)

// New board modal (sidebar entry point)
const showCreateBoard = ref(false)
const createBoardWorkspaceId = computed<string | null>(() => {
  const slug = route.path.startsWith('/agency/w/') ? String(route.params.slug || '') : ''
  return workspaces.value.find(w => w.slug === slug)?.id || null
})
function openCreateBoard() {
  close()
  showCreateBoard.value = true
}

// Build navigation from workspaces
const workspaceNav = computed<NavigationMenuItem[]>(() => {
  // Spend-only reviewer never sees the client workspace list.
  if (isSpendOnlyReviewer.value) return [] as NavigationMenuItem[]
  return (workspaces.value as AgencyWorkspace[]).map(ws => ({
    label: ws.name,
    icon: `i-lucide-${ws.icon || 'briefcase'}`,
    to: `/agency/w/${ws.slug}`,
    badge: ws.stats?.boards?.toString(),
    onSelect: () => {
      close()
      selectedWorkspace.value = ws.id
    },
    children: ws.boards?.map(board => ({
      label: board.name,
      to: `/agency/boards/${board.slug}`,
      badge: board.taskCount > 0 ? board.taskCount.toString() : undefined,
      onSelect: close
    })) || []
  })) as NavigationMenuItem[]
})

// Chat unread badge
const { totalUnreadCount: chatUnreadCount } = useChat()

// Open critical anomaly count — sidebar badge
const { count: anomalyCount } = useOpenAnomalyCount()

// Inbox unread badge — fetch initial count and stay live via SSE
const { unreadCount: inboxUnreadCount, fetchNotifications, connectToStream, disconnectFromStream } = useNotifications()
onMounted(async () => {
  try {
    await fetchNotifications({ unreadOnly: true })
  } catch {
    // ignore — badge just won't update until next fetch
  }
  connectToStream()
})
onBeforeUnmount(() => {
  disconnectFromStream()
})

// Xero connection status — drives XeroFlow section visibility.
// getCachedData: () => undefined forces a fresh fetch per mount so that after a
// user connects Xero elsewhere the nav reflects the new state without a hard refresh.
const xeroConnected = ref(false)

onMounted(async () => {
  try {
    const status = await layoutFetch<{ connected?: boolean }>('/api/xero/status')
    xeroConnected.value = Boolean(status.connected)
  } catch {
    xeroConnected.value = false
  }
})

// Main navigation — organized by feature groups, gated by RBAC
const mainNav = computed<NavigationMenuItem[]>(() => {
  // Spend-only reviewer: only the Ad Spend route, nothing else.
  if (isSpendOnlyReviewer.value) {
    return [
      { type: 'label', label: 'Ad Spend' },
      { label: 'Ad Spend', icon: 'i-lucide-megaphone', to: '/agency/social/spend', onSelect: close }
    ]
  }

  const items: NavigationMenuItem[] = [
    // Main — visible to all authenticated users
    { type: 'label', label: 'Main' },
    { label: 'Dashboard', icon: 'i-lucide-layout-dashboard', to: '/agency', exact: true, onSelect: close },
    { label: 'Inbox', icon: 'i-lucide-inbox', to: '/agency/inbox', badge: inboxUnreadCount.value > 0 ? inboxUnreadCount.value.toString() : undefined, onSelect: close },
    { label: 'All Boards', icon: 'i-lucide-layout-grid', to: '/agency/boards', onSelect: close },

    // Work Management — visible to all authenticated users
    { type: 'label', label: 'Work Management' },
    { label: 'Workflow', icon: 'i-lucide-git-branch', to: '/agency/workflow', onSelect: close },
    { label: 'Timeline', icon: 'i-lucide-gantt-chart', to: '/agency/workflow/timeline', onSelect: close },
    { label: 'Tasks', icon: 'i-lucide-check-square', to: '/agency/tasks', onSelect: close },

    // Projects — visible to all authenticated users
    { type: 'label', label: 'Projects' },
    { label: 'Projects', icon: 'i-lucide-folder-kanban', to: '/agency/projects', onSelect: close },
    { label: 'Briefs', icon: 'i-lucide-file-text', to: '/agency/briefs', onSelect: close },
    { label: 'Templates', icon: 'i-lucide-copy', to: '/agency/templates', onSelect: close },
    { label: 'Proofs', icon: 'i-lucide-image', to: '/agency/proofs', onSelect: close }
  ]

  if (canAccessAdmin.value) {
    items.push(
      { type: 'label', label: 'Operations' },
      { label: 'Job Operations', icon: 'i-lucide-server-cog', to: '/agency/operations/jobs', onSelect: close },
      { label: 'Client Billing', icon: 'i-lucide-credit-card', to: '/agency/operations/billing', onSelect: close }
    )
  }

  // Clients — canAccessClients
  if (canAccessClients.value) {
    items.push(
      { type: 'label', label: 'Clients' },
      { label: 'Clients', icon: 'i-lucide-building-2', to: '/agency/clients', onSelect: close },
      { label: 'CRM', icon: 'i-lucide-contact', to: '/agency/crm', onSelect: close },
      { label: 'Intake', icon: 'i-lucide-inbox', to: '/agency/intake', onSelect: close },
      { label: 'Client Portal', icon: 'i-lucide-globe', to: '/agency/client-portal', onSelect: close }
    )
  }

  if (hasPermission('PAGE_STUDIO_VIEW')) {
    items.push(
      { type: 'label', label: 'Websites' },
      { label: 'Sites', icon: 'i-lucide-panels-top-left', to: '/agency/page-studio', onSelect: close }
    )
    if (hasPermission('PAGE_STUDIO_APPROVE')) items.push({ label: 'Reviews', icon: 'i-lucide-badge-check', to: '/agency/page-studio/reviews', onSelect: close })
    if (hasPermission('PAGE_STUDIO_PUBLISH')) items.push({ label: 'Releases', icon: 'i-lucide-rocket', to: '/agency/page-studio/releases', onSelect: close })
    if (hasPermission('PAGE_STUDIO_DOMAINS')) items.push({ label: 'Domains & DNS', icon: 'i-lucide-globe-2', to: '/agency/page-studio/domains', onSelect: close })
    if (hasPermission('PAGE_STUDIO_SUBSCRIPTIONS')) items.push({ label: 'Subscriptions', icon: 'i-lucide-gauge', to: '/agency/page-studio/subscriptions', onSelect: close })
  }

  // Time & Capacity — visible to all authenticated users
  items.push(
    { type: 'label', label: 'Time & Capacity' },
    { label: 'Time Tracking', icon: 'i-lucide-clock', to: '/agency/time', onSelect: close },
    { label: 'Approvals', icon: 'i-lucide-check-check', to: '/agency/time/approvals', onSelect: close },
    { label: 'Time Reports', icon: 'i-lucide-bar-chart-3', to: '/agency/time/reports', onSelect: close },
    { label: 'Capacity', icon: 'i-lucide-gauge', to: '/agency/capacity', onSelect: close }
  )
  if (canAccessHr.value) {
    items.push(
      { label: 'Department Goals', icon: 'i-lucide-goal', to: '/agency/hr/goals', onSelect: close },
      { label: 'HR Benchmark Registry', icon: 'i-lucide-scale', to: '/agency/hr/benchmarks', onSelect: close },
      { label: 'HR Contract Vault', icon: 'i-lucide-file-lock-2', to: '/agency/hr/contracts', onSelect: close },
      { label: 'HR Launch Governance', icon: 'i-lucide-shield-check', to: '/agency/hr/governance', onSelect: close },
      { label: 'Monday Evidence Scope', icon: 'i-lucide-database-zap', to: '/agency/hr/monday', onSelect: close },
      { label: 'Monday Evidence Preview', icon: 'i-lucide-eye', to: '/agency/hr/monday/evidence', onSelect: close },
      { label: 'Monday Governed Import', icon: 'i-lucide-cloud-download', to: '/agency/hr/monday/import', onSelect: close }
    )
  }

  // Budget Tracker — canAccessMediaBuying
  if (canAccessMediaBuying.value) {
    items.push(
      { type: 'label', label: 'Budget Tracker' },
      { label: 'Analytics', icon: 'i-lucide-bar-chart-4', to: '/agency/analytics', onSelect: close },
      { label: 'Budget Health', icon: 'i-lucide-gauge', to: '/agency/budget-health', onSelect: close },
      { label: 'Site Tracking', icon: 'i-lucide-radio', to: '/agency/tracking', onSelect: close }
    )
  }

  // Social — paid + organic social operations
  const socialItems: NavigationMenuItem[] = []
  if (canAccessMediaBuying.value) {
    socialItems.push(...socialSpendSuiteNavItems(close))
    socialItems.push({ label: 'Dealer Feeds', icon: 'i-lucide-rss', to: '/agency/dealer-feeds', onSelect: close })
  }
  if (canAccessCreative.value) {
    socialItems.push(...socialSuiteNavItems(close))
  }
  if (socialItems.length) {
    items.push(
      { type: 'label', label: 'Social' },
      ...socialItems
    )
  }

  // Search & Content — organic search evidence, governed guides and the client-site
  // publishing/menu setup. Sits beside Social as a marketing surface, not budget tracking.
  const searchItems = canAccessMediaBuying.value
    ? searchAuthorityNavItems(Boolean(runtimeConfig.public.searchAuthorityEnabled), route.path, close)
    : []
  if (searchItems.length) {
    items.push(
      { type: 'label', label: 'Search & Content' },
      ...searchItems
    )
  }

  // Leads — inbound inquiries from Meta + Google lead forms. Visible to all
  // authenticated users; row-level access enforced server-side per client.
  items.push(
    { type: 'label', label: 'Leads' },
    { label: 'Lead Inbox', icon: 'i-lucide-mail-question', to: '/agency/leads', onSelect: close },
    { label: 'Email Marketing', icon: 'i-lucide-mail', to: '/agency/email', onSelect: close }
  )

  // Billing (scoped) — canAccessInvoices but NOT canAccessFinance (e.g. account managers)
  if (canAccessInvoices.value && !canAccessFinance.value) {
    items.push(
      { type: 'label', label: 'Billing' },
      { label: 'Invoices', icon: 'i-lucide-receipt', to: '/agency/billing', onSelect: close }
    )
  }

  // Finance — canAccessFinance
  if (canAccessFinance.value) {
    items.push(
      { type: 'label', label: 'Finance' },
      { label: 'Billing', icon: 'i-lucide-receipt', to: '/agency/billing', onSelect: close },
      { label: 'Expenses', icon: 'i-lucide-credit-card', to: '/agency/expenses', onSelect: close },
      { label: 'Retainers', icon: 'i-lucide-repeat', to: '/agency/retainers', onSelect: close },
      { label: 'Financial Health', icon: 'i-lucide-activity', to: '/agency/financial-health', onSelect: close }
    )
  }

  // Sales — canAccessSales
  if (canAccessSales.value) {
    items.push(
      { type: 'label', label: 'Sales' },
      { label: 'Sales', icon: 'i-lucide-handshake', to: '/agency/sales', onSelect: close },
      { label: 'Quotes', icon: 'i-lucide-file-badge', to: '/agency/sales/quotes', onSelect: close },
      { label: 'Pricing', icon: 'i-lucide-tag', to: '/agency/sales/pricing', onSelect: close },
      { label: 'Rate Card', icon: 'i-lucide-list-ordered', to: '/agency/rate-cards', onSelect: close },
      { label: 'Price Templates', icon: 'i-lucide-file-stack', to: '/agency/sales/templates', onSelect: close }
    )
  }

  // Reports — canAccessReports (MANAGEMENT roles)
  if (canAccessReports.value) {
    items.push(
      { type: 'label', label: 'Reports' },
      { label: 'Reports', icon: 'i-lucide-pie-chart', to: '/agency/reports', onSelect: close },
      { label: 'Project Health', icon: 'i-lucide-activity', to: '/agency/health', onSelect: close },
      { label: 'Alerts', icon: 'i-lucide-bell', to: '/agency/alerts', onSelect: close }
    )
  }

  // XeroFlow — finance-capable users AND Xero connected.
  if (canAccessFinance.value && xeroConnected.value) {
    items.push(
      { type: 'label' as const, label: 'XeroFlow' },
      { label: 'Xero Dashboard', icon: 'i-lucide-layout-dashboard', to: '/xeroflow', onSelect: close },
      { label: 'Get Out', icon: 'i-lucide-target', to: '/xeroflow/get-out', onSelect: close },
      { label: 'CFO Dashboard', icon: 'i-lucide-line-chart', to: '/xeroflow/cfo', onSelect: close },
      { label: 'Customers', icon: 'i-lucide-users', to: '/customers', onSelect: close },
      { label: 'Xero Invoices', icon: 'i-lucide-receipt', to: '/invoices', onSelect: close },
      { label: 'Invoice Builder', icon: 'i-lucide-file-plus', to: '/xeroflow/invoice-builder', onSelect: close },
      { label: 'Xero Expenses', icon: 'i-lucide-wallet', to: '/expenses', onSelect: close },
      { label: 'Cash Flow', icon: 'i-lucide-trending-up', to: '/cashflow', onSelect: close },
      { label: 'Profit & Loss', icon: 'i-lucide-pie-chart', to: '/profit-loss', onSelect: close },
      { label: 'Financial Reports', icon: 'i-lucide-file-text', to: '/reports', onSelect: close },
      { label: 'Advisor Backlog', icon: 'i-lucide-list-todo', to: '/advisor', onSelect: close },
      { label: 'Insights', icon: 'i-lucide-lightbulb', to: '/insights', onSelect: close },
      { label: 'Anomalies', icon: 'i-lucide-alert-triangle', to: '/anomalies', onSelect: close, badge: anomalyCount.value > 0 ? String(anomalyCount.value) : undefined },
      { label: 'Recommendations', icon: 'i-lucide-clipboard-check', to: '/recommendations', onSelect: close },
      { label: 'Finance AI', icon: 'i-lucide-brain', to: '/agency/ai/finance', onSelect: close }
    )
  }

  // Team — visible to all staff
  items.push(
    { type: 'label', label: 'Team' },
    { label: 'Team Members', icon: 'i-lucide-users', to: '/agency/team', onSelect: close },
    { label: 'Teams', icon: 'i-lucide-users-round', to: '/agency/teams', onSelect: close },
    {
      label: canAccessHr.value ? 'HR Business Review' : 'My Reviews',
      icon: 'i-lucide-clipboard-check',
      to: '/agency/hr',
      onSelect: close
    }
  )

  // Tools — AI Chat + Voice AI + Reports visible to all; Settings/Training/Knowledge admin-only; Automation gated
  items.push(
    { type: 'label', label: 'Tools' },
    { label: 'AI Chat', icon: 'i-lucide-sparkles', to: '/agency/ai/chat', exact: true, onSelect: close },
    { label: 'Voice AI', icon: 'i-lucide-audio-lines', to: '/agency/ai/chat?mode=voice', exact: true, onSelect: close },
    { label: 'AI Reports', icon: 'i-lucide-file-bar-chart', to: '/agency/ai/reports', onSelect: close },
    { label: 'Connect AI Assistants', icon: 'i-lucide-plug', to: '/agency/ai/connectors', onSelect: close }
  )
  // QR Codes lives under Tools (it's a utility, not budget tracking) but keeps
  // the media-buying gate its page enforces.
  if (canAccessMediaBuying.value) {
    items.push({ label: 'QR Codes', icon: 'i-lucide-qr-code', to: '/agency/qr-codes', onSelect: close })
  }
  if (canAccessAdmin.value) {
    items.push(
      { label: 'AI Settings', icon: 'i-lucide-settings-2', to: '/agency/ai/settings', onSelect: close },
      { label: 'Knowledge Base', icon: 'i-lucide-book-open', to: '/agency/ai/knowledge', onSelect: close }
    )
  }
  if (canAccessAiTraining.value) {
    items.push(
      { label: 'AI Training', icon: 'i-lucide-graduation-cap', to: '/agency/ai/training', onSelect: close }
    )
  }
  if (canAccessAutomation.value) {
    items.push(
      { label: 'Automation', icon: 'i-lucide-zap', to: '/agency/automation', onSelect: close },
      { label: 'Escalations', icon: 'i-lucide-bell-ring', to: '/agency/automation/escalations', onSelect: close }
    )
  }

  // Creative — canAccessCreative
  if (canAccessCreative.value) {
    items.push(
      { type: 'label', label: 'Creative' },
      { label: 'Banner Studio', icon: 'i-lucide-palette', to: '/agency/banner-studio', onSelect: close },
      { label: 'Templates', icon: 'i-lucide-layout-template', to: '/agency/banner-studio/templates', onSelect: close },
      { label: 'Brand Kits', icon: 'i-lucide-paintbrush', to: '/agency/banner-studio/brand-kits', onSelect: close },
      { label: 'Upload Banners', icon: 'i-lucide-upload', to: '/agency/banner-studio/upload', onSelect: close },
      { label: 'Audio Studio', icon: 'i-lucide-mic', to: '/agency/audio', onSelect: close },
      { label: 'Video Studio', icon: 'i-lucide-video', to: '/agency/audio/projects?mediaType=av', onSelect: close },
      { label: 'Audio Projects', icon: 'i-lucide-film', to: '/agency/audio/projects', onSelect: close },
      { label: 'Ad Preview', icon: 'i-lucide-monitor-play', to: '/agency/ad-preview', onSelect: close },
      { label: 'Bulk Ad Launch', icon: 'i-lucide-rocket', to: '/agency/ad-publish', onSelect: close }
    )
  }

  // Collaboration — Chat + Virtual Office, visible to all staff
  items.push(
    { type: 'label', label: 'Collaboration' },
    { label: 'Chat', icon: 'i-lucide-message-circle', to: '/agency/chat', badge: chatUnreadCount.value > 0 ? chatUnreadCount.value.toString() : undefined, onSelect: close },
    { label: 'Office', icon: 'i-lucide-building-2', to: '/office', onSelect: close }
  )

  return items
})

// Footer navigation — admin, integrations, settings (gated by role)
const footerNav = computed<NavigationMenuItem[]>(() => {
  const items: NavigationMenuItem[] = []

  // Spend-only reviewer: no settings/admin/integrations in the footer.
  if (isSpendOnlyReviewer.value) return items

  // Monday — admin only
  if (canAccessAdmin.value) {
    items.push({
      label: 'Monday',
      icon: 'i-lucide-cloud',
      children: [
        { label: 'Migration', icon: 'i-lucide-arrow-left-right', to: '/agency/monday', onSelect: close },
        { label: 'Migrate Data', icon: 'i-lucide-database', to: '/agency/monday/migrate', onSelect: close },
        { label: 'Items', icon: 'i-lucide-list', to: '/agency/monday/items', onSelect: close },
        { label: 'User Sync', icon: 'i-lucide-users', to: '/agency/monday/users', onSelect: close }
      ]
    })

    // Admin — admin only
    items.push({
      label: 'Admin',
      icon: 'i-lucide-shield',
      children: [
        { label: 'User Management', icon: 'i-lucide-users', to: '/admin/users', onSelect: close },
        { label: 'Teams', icon: 'i-lucide-users-round', to: '/admin/teams', onSelect: close },
        { label: 'Roles & Permissions', icon: 'i-lucide-shield-check', to: '/admin/permissions', onSelect: close },
        { label: 'Integrations', icon: 'i-lucide-plug-zap', to: '/admin/connections/integrations', onSelect: close },
        { label: 'AI & MCP', icon: 'i-lucide-cpu', to: '/admin/ai/mcp', onSelect: close }
      ]
    })
  }

  // Settings — visible to all staff
  items.push({
    label: 'Settings',
    icon: 'i-lucide-settings',
    children: [
      { label: 'Agency Settings', to: '/agency/settings', onSelect: close },
      { label: 'General', to: '/settings', exact: true, onSelect: close },
      { label: 'Members', to: '/settings/members', onSelect: close },
      { label: 'Notifications', to: '/settings/notifications', onSelect: close },
      { label: 'Watching', to: '/agency/notifications/watching', onSelect: close },
      { label: 'Security', to: '/settings/security', onSelect: close },
      ...(canAccessAdmin.value ? [{ label: 'AI Governance', icon: 'i-lucide-shield-check', to: '/admin/ai/governance', onSelect: close }] : []),
      ...(canAccessAdmin.value ? [{ label: 'AI Model Ops', icon: 'i-lucide-brain-circuit', to: '/admin/ai/model-ops', onSelect: close }] : []),
      // ADMIN-only CRM Search operations control plane.
      ...(canAccessAdmin.value ? [{ label: 'CRM Search Operations', icon: 'i-lucide-database-zap', to: '/admin/ai/crm-search', onSelect: close }] : []),
      ...(canAccessAdmin.value ? [{ label: 'Admin', to: '/settings/admin', onSelect: close }] : []),
      { label: 'Integrations', to: '/settings/integrations/monday', onSelect: close }
    ]
  })

  return items
})

// Search groups for UDashboardSearch
function toCommandPaletteItem(item: NavigationMenuItem): CommandPaletteItem | null {
  if (!item.to || !item.label) return null
  return {
    id: String(item.to),
    label: String(item.label),
    icon: typeof item.icon === 'string' ? item.icon : undefined,
    to: item.to,
    target: item.target
  } as CommandPaletteItem
}

const groups = computed<CommandPaletteGroup<CommandPaletteItem>[]>(() => [{
  id: 'links',
  label: 'Go to',
  items: [
    ...mainNav.value.filter(i => i.type !== 'label'),
    ...footerNav.value
  ].map(toCommandPaletteItem).filter((item): item is CommandPaletteItem => Boolean(item))
}, {
  id: 'code',
  label: 'Code',
  items: [{
    id: 'source',
    label: 'View page source',
    icon: 'i-simple-icons-github',
    to: `https://github.com/nuxt-ui-templates/dashboard/blob/main/app/pages${route.path === '/' ? '/index' : route.path}.vue`,
    target: '_blank'
  }]
}])

const scrollActiveMainNavItemIntoView = async (attempt = 0) => {
  if (!import.meta.client || !route.path.startsWith('/agency/social')) return

  await nextTick()

  const currentPath = route.path.replace(/\/$/, '') || '/'
  const links = Array.from(document.querySelectorAll<HTMLAnchorElement>('.agency-main-nav a[href]'))
  const activeLink = links.find((link) => {
    const linkPath = new URL(link.href, window.location.origin).pathname.replace(/\/$/, '') || '/'
    return linkPath === currentPath
  })
  const scrollContainer = activeLink?.closest<HTMLElement>('.overflow-y-auto')

  if (!activeLink || !scrollContainer) {
    if (attempt < 10) {
      window.setTimeout(() => scrollActiveMainNavItemIntoView(attempt + 1), 150)
    }
    return
  }

  const linkRect = activeLink.getBoundingClientRect()
  const containerRect = scrollContainer.getBoundingClientRect()
  const targetTop = scrollContainer.scrollTop
    + linkRect.top
    - containerRect.top
    - (containerRect.height / 2)
    + (linkRect.height / 2)

  scrollContainer.scrollTo({
    top: Math.max(0, targetTop),
    behavior: 'smooth'
  })
}

onMounted(() => {
  scrollActiveMainNavItemIntoView()
})

watch([() => route.path, () => mainNav.value.length], () => {
  scrollActiveMainNavItemIntoView()
}, { flush: 'post' })
</script>

<template>
  <UDashboardGroup unit="rem">
    <UDashboardSidebar
      id="agency"
      v-model:open="open"
      collapsible
      resizable
      class="bg-elevated/25"
      :ui="{ footer: 'lg:border-t lg:border-default' }"
    >
      <template #header="{ collapsed }">
        <div class="flex items-center gap-2 px-2">
          <UButton
            v-if="!isSpendOnlyReviewer"
            to="/agency/boards"
            variant="ghost"
            color="neutral"
            icon="i-lucide-arrow-left"
            size="sm"
          />
          <span v-if="!collapsed" class="font-semibold">{{ isSpendOnlyReviewer ? 'Ad Spend' : 'Workspaces' }}</span>
        </div>
      </template>

      <template #default="{ collapsed }">
        <UDashboardSearchButton v-if="!isSpendOnlyReviewer" :collapsed="collapsed" class="bg-transparent ring-default" />

        <!-- New Board Button -->
        <div v-if="!isSpendOnlyReviewer" class="px-2 py-2">
          <UButton
            v-if="!collapsed"
            color="primary"
            variant="soft"
            icon="i-lucide-plus"
            class="w-full justify-center"
            @click="openCreateBoard"
          >
            New Board
          </UButton>
        </div>

        <!-- Workspace List -->
        <UNavigationMenu
          :collapsed="collapsed"
          :items="workspaceNav"
          orientation="vertical"
          tooltip
          popover
        />

        <!-- Main Navigation -->
        <div class="agency-main-nav">
          <UNavigationMenu
            :collapsed="collapsed"
            :items="mainNav"
            orientation="vertical"
            tooltip
          />
        </div>

        <!-- Footer Navigation -->
        <UNavigationMenu
          :collapsed="collapsed"
          :items="footerNav"
          orientation="vertical"
          tooltip
          class="mt-auto"
        />
      </template>

      <template #footer="{ collapsed }">
        <UserMenu :collapsed="collapsed" />
      </template>
    </UDashboardSidebar>

    <UDashboardSearch :groups="groups" />

    <BoardCreateModal
      v-model="showCreateBoard"
      :workspace-id="createBoardWorkspaceId"
      :workspaces="workspaces"
    />

    <div
      :class="[
        'flex-1 min-w-0 min-h-0 flex flex-col',
        isClientAnalyticsRoute ? 'overflow-y-auto' : 'overflow-hidden'
      ]"
    >
      <slot />
    </div>

    <ClientOnly>
      <ActivityHub v-if="showActivityHub" />
    </ClientOnly>
  </UDashboardGroup>
</template>

<style scoped>
/* ── Sidebar icon hover animations ── */
/* Note: Iconify renders classes as i-lucide:name (colon) in the DOM */

/* Base transition for smooth animation start/end */
:deep(a [class*="i-lucide"]),
:deep(button [class*="i-lucide"]) {
  transition: transform 0.2s ease;
}

/* Default: subtle pop on hover */
:deep(a:hover [class*="i-lucide"]),
:deep(button:hover [class*="i-lucide"]) {
  animation: nav-pop 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
}

/* Rotate — settings/gear icons */
:deep(a:hover [class*="i-lucide:settings"]),
:deep(button:hover [class*="i-lucide:settings"]) {
  animation: nav-rotate 0.5s ease-in-out;
}

/* Wiggle — bell, alert, shield */
:deep(a:hover [class*="i-lucide:bell"]),
:deep(button:hover [class*="i-lucide:bell"]),
:deep(a:hover [class*="i-lucide:alert-triangle"]),
:deep(a:hover [class*="i-lucide:shield"]),
:deep(button:hover [class*="i-lucide:shield"]) {
  animation: nav-wiggle 0.5s ease-in-out;
}

/* Bounce — inbox, check icons, rocket, trending-up, upload */
:deep(a:hover [class*="i-lucide:inbox"]),
:deep(a:hover [class*="i-lucide:check-square"]),
:deep(a:hover [class*="i-lucide:check-check"]),
:deep(a:hover [class*="i-lucide:clipboard-check"]),
:deep(a:hover [class*="i-lucide:rocket"]),
:deep(a:hover [class*="i-lucide:trending-up"]),
:deep(a:hover [class*="i-lucide:upload"]) {
  animation: nav-bounce 0.4s ease;
}

/* Pulse — AI/energy/activity icons */
:deep(a:hover [class*="i-lucide:sparkles"]),
:deep(a:hover [class*="i-lucide:brain"]),
:deep(a:hover [class*="i-lucide:zap"]),
:deep(a:hover [class*="i-lucide:lightbulb"]),
:deep(a:hover [class*="i-lucide:activity"]),
:deep(a:hover [class*="i-lucide:graduation-cap"]) {
  animation: nav-pulse 0.5s ease;
}

/* Swing — clock, gauge */
:deep(a:hover [class*="i-lucide:clock"]),
:deep(a:hover [class*="i-lucide:gauge"]) {
  animation: nav-swing 0.5s ease-in-out;
}

/* Spin — repeat/sync icons */
:deep(a:hover [class*="i-lucide:repeat"]) {
  animation: nav-spin 0.6s ease-in-out;
}

/* Slide — message/chat icons */
:deep(a:hover [class*="i-lucide:message-circle"]) {
  animation: nav-slide 0.4s ease;
}

@keyframes nav-pop {
  0%, 100% { transform: scale(1); }
  40% { transform: scale(1.2); }
  70% { transform: scale(0.95); }
}

@keyframes nav-rotate {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(90deg); }
}

@keyframes nav-wiggle {
  0%, 100% { transform: rotate(0deg); }
  15% { transform: rotate(-12deg); }
  30% { transform: rotate(10deg); }
  50% { transform: rotate(-6deg); }
  70% { transform: rotate(3deg); }
}

@keyframes nav-bounce {
  0%, 100% { transform: translateY(0); }
  30% { transform: translateY(-3px); }
  55% { transform: translateY(0); }
  75% { transform: translateY(-1.5px); }
}

@keyframes nav-pulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.25); }
}

@keyframes nav-swing {
  0%, 100% { transform: rotate(0deg); }
  25% { transform: rotate(12deg); }
  75% { transform: rotate(-12deg); }
}

@keyframes nav-spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

@keyframes nav-slide {
  0%, 100% { transform: translateX(0); }
  40% { transform: translateX(2px); }
  70% { transform: translateX(-1px); }
}
</style>
