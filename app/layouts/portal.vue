<script setup lang="ts">
import type { NavigationMenuItem } from '@nuxt/ui'
import { portalSocialNavItems } from '~/utils/portalSocialNavigation'

const { user, stats, logout } = usePortalAuth()
const open = ref(false)
const layoutFetch = $fetch as <T>(request: string, options?: { query?: Record<string, unknown> }) => Promise<T>
const { data: pageStudioNavigation } = useFetch<{
  total: number
}>('/api/portal/page-studio/sites', {
  query: { page: 1, pageSize: 1 },
  default: () => ({ total: 0 })
})

const close = () => {
  open.value = false
}
const isAgencyAccess = computed(() => user.value?.title === 'Agency portal access' || user.value?.email?.endsWith('@portal-access.local'))

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

const mainNav = computed<NavigationMenuItem[]>(() => {
  const items = [
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
    { label: 'Leads', icon: 'i-lucide-inbox', to: '/portal/leads', onSelect: close },
    { label: 'CRM', icon: 'i-lucide-contact', to: '/portal/crm', onSelect: close },
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
          { label: 'Analytics', icon: 'i-lucide-bar-chart-4', to: '/portal/analytics?metric=leads', onSelect: close }
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
  ] as NavigationMenuItem[]

  if (pageStudioNavigation.value.total > 0) {
    items.splice(1, 0,
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
        <UDropdownMenu
          :items="[
            [{
              label: user?.name || 'User',
              type: 'label' as const
            }],
            [{
               label: 'Settings',
               icon: 'i-lucide-settings',
               to: '/portal/settings'
             },
             {
               label: 'Sign out',
               icon: 'i-lucide-log-out',
               onSelect: handleLogout
             }]
          ]"
        >
          <div class="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-elevated rounded-md">
            <UAvatar
              :src="user?.avatarUrl || undefined"
              :alt="user?.name"
              size="sm"
            />
            <div v-if="!collapsed" class="min-w-0 flex-1">
              <p class="text-sm font-medium truncate">
                {{ user?.name }}
              </p>
              <p class="text-xs text-muted truncate">
                {{ user?.email }}
              </p>
            </div>
            <UIcon v-if="!collapsed" name="i-lucide-chevrons-up-down" class="text-muted w-4 h-4 shrink-0" />
          </div>
        </UDropdownMenu>
      </template>
    </UDashboardSidebar>

    <div class="flex-1 min-w-0 flex flex-col overflow-hidden">
      <div
        v-if="isAgencyAccess"
        class="shrink-0 border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900 dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-100"
      >
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-shield-check" class="h-4 w-4 shrink-0" />
          <span class="truncate">Agency access: viewing {{ user?.clientName }} as {{ user?.name }}.</span>
        </div>
      </div>
      <slot />
    </div>
    <!-- Docked customer co-pilot (flag-gated launcher; server endpoints are the real boundary). -->
    <PortalCopilot />
  </UDashboardGroup>
</template>
