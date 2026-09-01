<script setup lang="ts">
import type { NavigationMenuItem } from '@nuxt/ui'
import { portalSocialNavItems } from '~/utils/portalSocialNavigation'

const { user, stats, logout } = usePortalAuth()
const route = useRoute()
const config = useRuntimeConfig()
const open = ref(false)
const { data: searchAuthorityAvailability } = await useFetch<{
  available: boolean
}>('/api/portal/search-authority/availability', {
  default: () => ({ available: false })
})
const { data: pageStudioNavigation } = useFetch<{
  total: number
}>('/api/portal/page-studio/sites', {
  query: { page: 1, pageSize: 1 },
  default: () => ({ total: 0 })
})

const close = () => {
  open.value = false
}

const navBadge = (value?: number) => value && value > 0 ? value.toString() : undefined
const analyticsMenuOpen = computed(() =>
  route.path === '/portal/analytics' || route.path.startsWith('/portal/analytics/')
)
const leadCaptureMode = computed(() => user.value?.leadCaptureMode || 'capture_only')
const canViewCrm = computed(() =>
  Boolean(user.value?.isPrimaryContact || user.value?.permissions?.canViewCrm)
)

const mainNav = computed<NavigationMenuItem[]>(() => {
  const items = [
    { label: 'Dashboard', icon: 'i-lucide-layout-dashboard', to: '/portal', exact: true, onSelect: close },
    { label: 'Recent Activity', icon: 'i-lucide-history', to: '/portal/activity', onSelect: close },
    ...(user.value?.permissions?.canViewProjects
      ? ([{
          label: 'Jobs',
          icon: 'i-lucide-folder-kanban',
          to: stats.value?.activeProjects ? '/portal/projects?status=active' : '/portal/projects?view=upcoming',
          badge: navBadge(stats.value?.activeProjects),
          onSelect: close
        }] as NavigationMenuItem[])
      : []),
    ...(user.value?.permissions?.canViewProjects
      ? ([{
          label: 'Board',
          icon: 'i-lucide-panels-top-left',
          to: '/portal/board',
          onSelect: close
        }] as NavigationMenuItem[])
      : []),
    ...(user.value?.permissions?.canApproveWork
      ? ([{
          label: 'Approvals',
          icon: 'i-lucide-check-circle',
          to: stats.value?.pendingApprovals ? '/portal/approvals?status=pending' : '/portal/approvals',
          badge: navBadge(stats.value?.pendingApprovals),
          onSelect: close
        }] as NavigationMenuItem[])
      : []),
    { label: 'Video reviews', icon: 'i-lucide-clapperboard', to: '/portal/video-reviews', onSelect: close },
    { label: 'Requests', icon: 'i-lucide-message-square-plus', to: stats.value?.openRequests ? '/portal/requests?view=open' : '/portal/requests?view=resolved', badge: navBadge(stats.value?.openRequests), onSelect: close },
    ...(leadCaptureMode.value !== 'analytics_only'
      ? [{ label: 'Leads', icon: 'i-lucide-inbox', to: '/portal/leads', onSelect: close }]
      : []),
    ...(['lightweight_crm', 'full_crm'].includes(leadCaptureMode.value) && canViewCrm.value
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
              ...(config.public.nearbyMarketDiscoveryEnabled === true
                ? [{
                    label: 'Nearby market',
                    to: '/portal/analytics/market',
                    onSelect: close
                  }]
                : []),
              {
                label: 'Identity Reconciliation',
                to: '/portal/analytics/identity',
                onSelect: close
              },
              ...(config.public.searchAuthorityEnabled === true
                && searchAuthorityAvailability.value.available
                ? [{
                    label: 'Search Authority',
                    to: '/portal/search-authority',
                    onSelect: close
                  }]
                : [])
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
      to: stats.value?.unreadNotifications ? '/portal/notifications?view=unread' : '/portal/notifications',
      badge: navBadge(stats.value?.unreadNotifications),
      onSelect: close
    }
  ] as NavigationMenuItem[]

  if (pageStudioNavigation.value.total > 0) {
    items.splice(2, 0,
      {
        label: 'Websites',
        icon: 'i-lucide-panels-top-left',
        to: '/portal/page-studio',
        onSelect: close
      },
      {
        label: 'Domains & DNS',
        icon: 'i-lucide-globe-2',
        to: '/portal/page-studio/domains',
        onSelect: close
      },
      {
        label: 'Release history',
        icon: 'i-lucide-history',
        to: '/portal/page-studio/releases',
        onSelect: close
      }
    )
  }

  return items
})

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
  <UDashboardGroup unit="rem" class="portal-print-shell">
    <UDashboardSidebar
      id="portal"
      v-model:open="open"
      collapsible
      resizable
      class="bg-elevated/25 print:hidden"
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
        <UDropdownMenu :items="identityItems" :ui="{ content: 'w-full' }" class="w-full">
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

    <div class="flex-1 w-full min-w-0 min-h-0 flex flex-col overflow-x-hidden overflow-y-auto print:overflow-visible portal-print-content">
      <slot />
    </div>
    <!-- Docked customer co-pilot (flag-gated launcher; server endpoints are the real boundary). -->
    <PortalCopilot class="print:hidden" />
  </UDashboardGroup>
</template>

<style>
@media print {
  html,
  body,
  #__nuxt {
    height: auto !important;
    overflow: visible !important;
  }

  .portal-print-shell {
    position: static !important;
    inset: auto !important;
    display: block !important;
    overflow: visible !important;
  }

  .portal-print-content {
    display: block !important;
    width: 100% !important;
    overflow: visible !important;
  }
}
</style>
