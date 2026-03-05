<script setup lang="ts">
import type { NavigationMenuItem } from '@nuxt/ui'

const route = useRoute()
const open = ref(false)
const selectedWorkspace = ref<string | null>(null)

const close = () => { open.value = false }

// Fetch workspaces
const { data: workspacesData } = useLazyFetch('/api/agency/workspaces')
const workspaces = computed(() => workspacesData.value?.workspaces || [])

// Build navigation from workspaces
const workspaceNav = computed(() => {
  return workspaces.value.map((ws: any) => ({
    label: ws.name,
    icon: `i-lucide-${ws.icon || 'briefcase'}`,
    to: `/agency/w/${ws.slug}`,
    badge: ws.stats?.boards?.toString(),
    onSelect: () => {
      close()
      selectedWorkspace.value = ws.id
    },
    children: ws.boards?.map((board: any) => ({
      label: board.name,
      to: `/agency/boards/${board.slug}`,
      badge: board.taskCount > 0 ? board.taskCount.toString() : undefined,
      onSelect: close
    })) || []
  })) as NavigationMenuItem[]
})

// Chat unread badge
const { totalUnreadCount: chatUnreadCount } = useChat()

// Xero connection status — drives XeroFlow section visibility
const { data: xeroStatus } = useLazyFetch('/api/xero/status')
const xeroConnected = computed(() => xeroStatus.value?.connected ?? false)

// Main navigation — organized by feature groups
const mainNav = computed<NavigationMenuItem[]>(() => [
  // Main
  { type: 'label', label: 'Main' },
  { label: 'Dashboard', icon: 'i-lucide-layout-dashboard', to: '/agency', exact: true, onSelect: close },
  { label: 'Inbox', icon: 'i-lucide-inbox', to: '/agency/inbox', badge: '4', onSelect: close },
  { label: 'All Boards', icon: 'i-lucide-layout-grid', to: '/agency/boards', onSelect: close },

  // Work Management
  { type: 'label', label: 'Work Management' },
  { label: 'Workflow', icon: 'i-lucide-git-branch', to: '/agency/workflow', onSelect: close },
  { label: 'Timeline', icon: 'i-lucide-gantt-chart', to: '/agency/workflow/timeline', onSelect: close },
  { label: 'Tasks', icon: 'i-lucide-check-square', to: '/agency/tasks', onSelect: close },

  // Projects
  { type: 'label', label: 'Projects' },
  { label: 'Projects', icon: 'i-lucide-folder-kanban', to: '/agency/projects', onSelect: close },
  { label: 'Briefs', icon: 'i-lucide-file-text', to: '/agency/briefs', onSelect: close },
  { label: 'Templates', icon: 'i-lucide-copy', to: '/agency/templates', onSelect: close },
  { label: 'Proofs', icon: 'i-lucide-image', to: '/agency/proofs', onSelect: close },

  // Clients
  { type: 'label', label: 'Clients' },
  { label: 'Clients', icon: 'i-lucide-building-2', to: '/agency/clients', onSelect: close },
  { label: 'Intake', icon: 'i-lucide-inbox', to: '/agency/intake', onSelect: close },
  { label: 'Client Portal', icon: 'i-lucide-globe', to: '/agency/client-portal', onSelect: close },

  // Time & Capacity
  { type: 'label', label: 'Time & Capacity' },
  { label: 'Time Tracking', icon: 'i-lucide-clock', to: '/agency/time', onSelect: close },
  { label: 'Approvals', icon: 'i-lucide-check-check', to: '/agency/time/approvals', onSelect: close },
  { label: 'Time Reports', icon: 'i-lucide-bar-chart-3', to: '/agency/time/reports', onSelect: close },
  { label: 'Capacity', icon: 'i-lucide-gauge', to: '/agency/capacity', onSelect: close },

  // Budget Tracker
  { type: 'label', label: 'Budget Tracker' },
  { label: 'Analytics', icon: 'i-lucide-bar-chart-4', to: '/agency/analytics', onSelect: close },
  { label: 'Ad Spend', icon: 'i-lucide-wallet', to: '/agency/social/spend', onSelect: close },
  { label: 'Meta Ads', icon: 'i-lucide-facebook', to: '/agency/social/meta', onSelect: close },
  { label: 'Google Ads', icon: 'i-lucide-chrome', to: '/agency/social/google', onSelect: close },
  { label: 'TikTok Ads', icon: 'i-lucide-music', to: '/agency/social/tiktok', onSelect: close },
  { label: 'Connections', icon: 'i-lucide-plug', to: '/agency/social', onSelect: close },
  { label: 'Budget Health', icon: 'i-lucide-gauge', to: '/agency/budget-health', onSelect: close },

  // Finance
  { type: 'label', label: 'Finance' },
  { label: 'Billing', icon: 'i-lucide-receipt', to: '/agency/billing', onSelect: close },
  { label: 'Expenses', icon: 'i-lucide-credit-card', to: '/agency/expenses', onSelect: close },
  { label: 'Retainers', icon: 'i-lucide-repeat', to: '/agency/retainers', onSelect: close },
  { label: 'Financial Health', icon: 'i-lucide-activity', to: '/agency/financial-health', onSelect: close },

  // Sales
  { type: 'label', label: 'Sales' },
  { label: 'Sales', icon: 'i-lucide-handshake', to: '/agency/sales', onSelect: close },
  { label: 'Quotes', icon: 'i-lucide-file-badge', to: '/agency/sales/quotes', onSelect: close },
  { label: 'Pricing', icon: 'i-lucide-tag', to: '/agency/sales/pricing', onSelect: close },
  { label: 'Rate Card', icon: 'i-lucide-list-ordered', to: '/agency/rate-cards', onSelect: close },
  { label: 'Price Templates', icon: 'i-lucide-file-stack', to: '/agency/sales/templates', onSelect: close },

  // Reports
  { type: 'label', label: 'Reports' },
  { label: 'Reports', icon: 'i-lucide-pie-chart', to: '/agency/reports', onSelect: close },
  { label: 'Project Health', icon: 'i-lucide-activity', to: '/agency/health', onSelect: close },
  { label: 'Alerts', icon: 'i-lucide-bell', to: '/agency/alerts', onSelect: close },

  // XeroFlow (Xero-connected accounting features)
  ...(xeroConnected.value ? [
    { type: 'label' as const, label: 'XeroFlow' },
    { label: 'Xero Dashboard', icon: 'i-lucide-layout-dashboard', to: '/xeroflow', onSelect: close },
    { label: 'Customers', icon: 'i-lucide-users', to: '/customers', onSelect: close },
    { label: 'Xero Invoices', icon: 'i-lucide-receipt', to: '/invoices', onSelect: close },
    { label: 'Xero Expenses', icon: 'i-lucide-wallet', to: '/expenses', onSelect: close },
    { label: 'Cash Flow', icon: 'i-lucide-trending-up', to: '/cashflow', onSelect: close },
    { label: 'Profit & Loss', icon: 'i-lucide-pie-chart', to: '/profit-loss', onSelect: close },
    { label: 'Financial Reports', icon: 'i-lucide-file-text', to: '/reports', onSelect: close },
    { label: 'Insights', icon: 'i-lucide-lightbulb', to: '/insights', onSelect: close },
    { label: 'Anomalies', icon: 'i-lucide-alert-triangle', to: '/anomalies', onSelect: close },
    { label: 'Recommendations', icon: 'i-lucide-clipboard-check', to: '/recommendations', onSelect: close },
    { label: 'Finance AI', icon: 'i-lucide-brain', to: '/agency/ai/finance', onSelect: close },
  ] : []),

  // Team
  { type: 'label', label: 'Team' },
  { label: 'Team Members', icon: 'i-lucide-users', to: '/agency/team', onSelect: close },
  { label: 'Teams', icon: 'i-lucide-users-round', to: '/agency/teams', onSelect: close },

  // Tools
  { type: 'label', label: 'Tools' },
  { label: 'AI Chat', icon: 'i-lucide-sparkles', to: '/agency/ai/chat', onSelect: close },
  { label: 'AI Reports', icon: 'i-lucide-file-bar-chart', to: '/agency/ai/reports', onSelect: close },
  { label: 'AI Settings', icon: 'i-lucide-settings-2', to: '/agency/ai/settings', onSelect: close },
  { label: 'Knowledge Base', icon: 'i-lucide-book-open', to: '/agency/ai/knowledge', onSelect: close },
  { label: 'AI Training', icon: 'i-lucide-graduation-cap', to: '/agency/ai/training', onSelect: close },
  { label: 'Automation', icon: 'i-lucide-zap', to: '/agency/automation', onSelect: close },

  // Creative
  { type: 'label', label: 'Creative' },
  { label: 'Banner Studio', icon: 'i-lucide-palette', to: '/agency/banner-studio', onSelect: close },
  { label: 'Templates', icon: 'i-lucide-layout-template', to: '/agency/banner-studio/templates', onSelect: close },
  { label: 'Brand Kits', icon: 'i-lucide-paintbrush', to: '/agency/banner-studio/brand-kits', onSelect: close },
  { label: 'Upload Banners', icon: 'i-lucide-upload', to: '/agency/banner-studio/upload', onSelect: close },
  { label: 'Ad Preview', icon: 'i-lucide-monitor-play', to: '/agency/ad-preview', onSelect: close },
  { label: 'Bulk Ad Launch', icon: 'i-lucide-rocket', to: '/agency/ad-publish', onSelect: close },
  { label: 'Chat', icon: 'i-lucide-message-circle', to: '/agency/chat', badge: chatUnreadCount.value > 0 ? chatUnreadCount.value.toString() : undefined, onSelect: close },
])

// Footer navigation — admin, integrations, settings
const footerNav: NavigationMenuItem[] = [
  {
    label: 'Monday',
    icon: 'i-lucide-cloud',
    children: [
      { label: 'Migration', icon: 'i-lucide-arrow-left-right', to: '/agency/monday', onSelect: close },
      { label: 'Migrate Data', icon: 'i-lucide-database', to: '/agency/monday/migrate', onSelect: close },
      { label: 'Items', icon: 'i-lucide-list', to: '/agency/monday/items', onSelect: close },
      { label: 'User Sync', icon: 'i-lucide-users', to: '/agency/monday/users', onSelect: close },
    ]
  },
  {
    label: 'Admin',
    icon: 'i-lucide-shield',
    children: [
      { label: 'User Management', icon: 'i-lucide-users', to: '/admin/users', onSelect: close },
      { label: 'Teams', icon: 'i-lucide-users-round', to: '/admin/teams', onSelect: close },
    ]
  },
  {
    label: 'Settings',
    icon: 'i-lucide-settings',
    children: [
      { label: 'Agency Settings', to: '/agency/settings', onSelect: close },
      { label: 'General', to: '/settings', exact: true, onSelect: close },
      { label: 'Members', to: '/settings/members', onSelect: close },
      { label: 'Notifications', to: '/settings/notifications', onSelect: close },
      { label: 'Security', to: '/settings/security', onSelect: close },
      { label: 'Admin', to: '/settings/admin', onSelect: close },
      { label: 'Integrations', to: '/settings/integrations/monday', onSelect: close },
    ]
  },
]

// Search groups for UDashboardSearch
const groups = computed(() => [{
  id: 'links',
  label: 'Go to',
  items: [
    ...mainNav.value.filter(i => i.type !== 'label'),
    ...footerNav,
  ]
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
            to="/agency/boards"
            variant="ghost"
            color="neutral"
            icon="i-lucide-arrow-left"
            size="sm"
          />
          <span v-if="!collapsed" class="font-semibold">Workspaces</span>
        </div>
      </template>

      <template #default="{ collapsed }">
        <UDashboardSearchButton :collapsed="collapsed" class="bg-transparent ring-default" />

        <!-- New Board Button -->
        <div class="px-2 py-2">
          <UButton
            v-if="!collapsed"
            color="primary"
            variant="soft"
            icon="i-lucide-plus"
            class="w-full justify-center"
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
        <UNavigationMenu
          :collapsed="collapsed"
          :items="mainNav"
          orientation="vertical"
          tooltip
        />

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

    <div class="flex-1 min-w-0 flex flex-col overflow-hidden">
      <slot />
    </div>

    <ActivityHub />
  </UDashboardGroup>
</template>
