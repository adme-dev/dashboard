<script setup lang="ts">
import type { NavigationMenuItem } from '@nuxt/ui'
import { portalSocialNavItems } from '~/utils/portalSocialNavigation'

const { user, stats, logout } = usePortalAuth()
const route = useRoute()
const open = ref(false)
const layoutFetch = $fetch as <T>(request: string, options?: { query?: Record<string, unknown> }) => Promise<T>

const close = () => {
  open.value = false
}

// Notification count (fetched separately)
const unreadCount = ref(0)
onMounted(async () => {
  try {
    const data = await layoutFetch<{ unreadCount?: number }>('/api/portal/notifications', {
      query: { unreadOnly: 'true', limit: 1 }
    })
    unreadCount.value = data.unreadCount || 0
  } catch {
    unreadCount.value = 0
  }
})
const navBadge = (value?: number) => value && value > 0 ? value.toString() : undefined
const analyticsMenuOpen = computed(() =>
  route.path === '/portal/analytics' || route.path.startsWith('/portal/analytics/')
)
const leadCaptureMode = computed(() => user.value?.leadCaptureMode || 'capture_only')

const mainNav = computed<NavigationMenuItem[]>(() => [
  { label: 'Dashboard', icon: 'i-lucide-layout-dashboard', to: '/portal', exact: true, onSelect: close },
  {
    label: 'Jobs',
    icon: 'i-lucide-folder-kanban',
    to: stats.value?.activeProjects ? '/portal/projects?status=active' : '/portal/projects?view=upcoming',
    badge: navBadge(stats.value?.activeProjects),
    onSelect: close
  },
  { label: 'Approvals', icon: 'i-lucide-check-circle', to: stats.value?.pendingApprovals ? '/portal/approvals?status=pending' : '/portal/approvals', badge: navBadge(stats.value?.pendingApprovals), onSelect: close },
  { label: 'Video reviews', icon: 'i-lucide-clapperboard', to: '/portal/video-reviews', onSelect: close },
  { label: 'Requests', icon: 'i-lucide-message-square-plus', to: stats.value?.openRequests ? '/portal/requests?view=open' : '/portal/requests?view=resolved', badge: navBadge(stats.value?.openRequests), onSelect: close },
  ...(leadCaptureMode.value !== 'analytics_only'
    ? [{ label: 'Leads', icon: 'i-lucide-inbox', to: '/portal/leads', onSelect: close }]
    : []),
  ...(leadCaptureMode.value === 'full_crm'
    ? [{ label: 'CRM', icon: 'i-lucide-contact', to: '/portal/crm', onSelect: close }]
    : []),
  { label: 'Measurement', icon: 'i-lucide-activity', to: '/portal/measurement', onSelect: close },
  ...portalSocialNavItems(close),
  { label: 'Meetings', icon: 'i-lucide-video', to: '/portal/meetings?view=upcoming', onSelect: close },
  ...(user.value?.permissions?.canSubmitRequests
    ? [
        { label: 'Briefs', icon: 'i-lucide-file-text', to: '/portal/briefs?status=submitted', onSelect: close }
      ]
    : []),
  { label: 'Gallery', icon: 'i-lucide-image', to: '/portal/gallery', onSelect: close },
  { label: 'Features', icon: 'i-lucide-sparkles', to: '/portal/features', onSelect: close },
  ...(user.value?.permissions?.canViewAnalytics
    ? [
        {
          label: 'Analytics',
          icon: 'i-lucide-bar-chart-4',
          to: '/portal/analytics?metric=leads',
          type: 'trigger',
          defaultOpen: analyticsMenuOpen.value,
          children: [
            {
              label: 'Overview',
              to: '/portal/analytics?metric=leads',
              onSelect: close
            },
            {
              label: 'Google',
              to: '/portal/analytics/google',
              onSelect: close
            },
            {
              label: 'Meta',
              to: '/portal/analytics/meta',
              onSelect: close
            },
            {
              label: 'LinkedIn',
              to: '/portal/analytics/linkedin',
              onSelect: close
            },
            {
              label: 'TikTok',
              to: '/portal/analytics/tiktok',
              onSelect: close
            },
            {
              label: 'Website + Funnel',
              to: '/portal/analytics/website',
              onSelect: close
            },
            {
              label: 'Personas & Audiences',
              to: '/portal/analytics/audiences',
              onSelect: close
            },
            {
              label: 'Identity Reconciliation',
              to: '/portal/analytics/identity',
              onSelect: close
            }
          ]
        }
      ]
    : []),
  ...(user.value?.permissions?.canViewInvoices
    ? [
        { label: 'Invoices', icon: 'i-lucide-receipt', to: '/portal/invoices?view=current', onSelect: close }
      ]
    : []),
  {
    label: 'Notifications',
    icon: 'i-lucide-bell',
    to: unreadCount.value || stats.value?.unreadNotifications ? '/portal/notifications?view=unread' : '/portal/notifications',
    badge: navBadge(unreadCount.value || stats.value?.unreadNotifications),
    onSelect: close
  }
])

const footerItems: NavigationMenuItem[] = [
  { label: 'Settings', icon: 'i-lucide-settings', to: '/portal/settings', onSelect: close }
]
const identityItems = computed(() => [[{
  label: user.value?.name || 'User',
  type: 'label' as const
}], [{
  label: 'Settings',
  icon: 'i-lucide-settings',
  to: '/portal/settings'
}, {
  label: 'Sign out',
  icon: 'i-lucide-log-out',
  onSelect: handleLogout
}]])

async function handleLogout() {
  close()
  await logout()
}
</script>

<template>
  <UDashboardGroup unit="rem">
    <UDashboardSidebar
      id="portal"
      v-model:open="open"
      collapsible
      resizable
      class="bg-elevated/25"
      :ui="{ footer: 'lg:border-t lg:border-default' }"
    >
      <template #header="{ collapsed }">
        <div class="flex items-center gap-3 px-3 py-2">
          <UAvatar
            v-if="user?.clientLogo"
            :src="user.clientLogo"
            :alt="user?.clientName"
            size="sm"
          />
          <div v-else class="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
            <UIcon name="i-lucide-building-2" class="text-primary" />
          </div>
          <div v-if="!collapsed" class="min-w-0">
            <p class="font-semibold text-sm truncate">
              {{ user?.clientName }}
            </p>
            <p class="text-xs text-muted truncate">
              Client Portal
            </p>
          </div>
        </div>
      </template>

      <template #default="{ collapsed }">
        <UNavigationMenu
          :collapsed="collapsed"
          :items="mainNav"
          orientation="vertical"
          tooltip
        />

        <UNavigationMenu
          :collapsed="collapsed"
          :items="footerItems"
          orientation="vertical"
          tooltip
          class="mt-auto"
        />
      </template>

      <template #footer="{ collapsed }">
        <UDropdownMenu :items="identityItems" :ui="{ base: 'w-full', content: 'w-full' }">
          <div class="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-elevated rounded-md w-full">
            <UAvatar
              :src="user?.avatarUrl || undefined"
              :alt="user?.name"
              size="sm"
            />
            <div v-if="!collapsed" class="min-w-0 flex-1">
              <p class="text-sm font-medium truncate">
                {{ user?.name }}
              </p>
            </div>
            <UIcon v-if="!collapsed" name="i-lucide-chevrons-up-down" class="text-muted w-4 h-4 shrink-0" />
          </div>
        </UDropdownMenu>
      </template>
    </UDashboardSidebar>

    <div class="flex-1 min-w-0 min-h-0 flex flex-col overflow-x-hidden overflow-y-auto">
      <slot />
    </div>
    <!-- Docked customer co-pilot (flag-gated launcher; server endpoints are the real boundary). -->
    <PortalCopilot />
  </UDashboardGroup>
</template>
