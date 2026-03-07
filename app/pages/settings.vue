<script setup lang="ts">
import type { NavigationMenuItem } from '@nuxt/ui'

definePageMeta({ layout: 'agency' })

const links = [[{
  label: 'General',
  icon: 'i-lucide-settings',
  to: '/settings',
  exact: true
}, {
  label: 'Profile',
  icon: 'i-lucide-user',
  to: '/settings/profile'
}, {
  label: 'Members',
  icon: 'i-lucide-users',
  to: '/settings/members'
}, {
  label: 'Notifications',
  icon: 'i-lucide-bell',
  to: '/settings/notifications'
}, {
  label: 'Security',
  icon: 'i-lucide-shield',
  to: '/settings/security'
}, {
  label: 'Admin',
  icon: 'i-lucide-wrench',
  to: '/settings/admin'
}]] satisfies NavigationMenuItem[][]
</script>

<template>
  <UDashboardPanel id="settings" :ui="{ body: 'lg:py-12' }">
    <template #header>
      <UDashboardNavbar title="Settings">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>

      <UDashboardToolbar>
        <!-- NOTE: The `-mx-1` class is used to align with the `DashboardSidebarCollapse` button here. -->
        <UNavigationMenu :items="links" highlight class="-mx-1 flex-1" />
      </UDashboardToolbar>
    </template>

    <template #body>
      <div class="flex flex-col gap-4 sm:gap-6 lg:gap-8 w-full">
        <NuxtPage />
      </div>
    </template>
  </UDashboardPanel>
</template>
