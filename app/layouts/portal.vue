<script setup lang="ts">
import type { NavigationMenuItem } from '@nuxt/ui'

const { user, logout } = usePortalAuth()
const route = useRoute()
const open = ref(false)

const close = () => { open.value = false }

// Notification count (fetched separately)
const { data: notifData } = useLazyFetch('/api/portal/notifications', {
  query: { unreadOnly: 'true', limit: 1 }
})
const unreadCount = computed(() => notifData.value?.unreadCount || 0)

const mainNav = computed<NavigationMenuItem[]>(() => [
  { label: 'Dashboard', icon: 'i-lucide-layout-dashboard', to: '/portal', exact: true, onSelect: close },
  { label: 'Projects', icon: 'i-lucide-folder-kanban', to: '/portal/projects', onSelect: close },
  { label: 'Approvals', icon: 'i-lucide-check-circle', to: '/portal/approvals', onSelect: close },
  { label: 'Gallery', icon: 'i-lucide-image', to: '/portal/gallery', onSelect: close },
  ...(user.value?.permissions?.canViewAnalytics ? [
    { label: 'Analytics', icon: 'i-lucide-bar-chart-4', to: '/portal/analytics', onSelect: close }
  ] : []),
  ...(user.value?.permissions?.canViewInvoices ? [
    { label: 'Invoices', icon: 'i-lucide-receipt', to: '/portal/invoices', onSelect: close }
  ] : []),
  {
    label: 'Notifications',
    icon: 'i-lucide-bell',
    to: '/portal/notifications',
    badge: unreadCount.value > 0 ? unreadCount.value.toString() : undefined,
    onSelect: close
  },
])

const footerItems: NavigationMenuItem[] = [
  { label: 'Settings', icon: 'i-lucide-settings', to: '/portal/settings', onSelect: close },
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
            <p class="font-semibold text-sm truncate">{{ user?.clientName }}</p>
            <p class="text-xs text-muted truncate">Client Portal</p>
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
              click: handleLogout
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
              <p class="text-sm font-medium truncate">{{ user?.name }}</p>
              <p class="text-xs text-muted truncate">{{ user?.email }}</p>
            </div>
            <UIcon v-if="!collapsed" name="i-lucide-chevrons-up-down" class="text-muted w-4 h-4 shrink-0" />
          </div>
        </UDropdownMenu>
      </template>
    </UDashboardSidebar>

    <div class="flex-1 min-w-0 flex flex-col overflow-hidden">
      <slot />
    </div>
  </UDashboardGroup>
</template>
