<script setup lang="ts">
import type { NavigationMenuItem } from '@nuxt/ui'

definePageMeta({ layout: 'agency' })

const links = [[{
  label: 'Dashboard',
  icon: 'i-lucide-layout-dashboard',
  to: '/admin',
  exact: true
}, {
  label: 'Users',
  icon: 'i-lucide-users',
  to: '/admin/users'
}, {
  label: 'Teams',
  icon: 'i-lucide-users-round',
  to: '/admin/teams'
}, {
  label: 'Security',
  icon: 'i-lucide-shield',
  to: '/admin/security/auth'
}, {
  label: 'Billing',
  icon: 'i-lucide-credit-card',
  to: '/admin/billing/plans'
}, {
  label: 'Connections',
  icon: 'i-lucide-plug',
  to: '/admin/connections/integrations'
}, {
  label: 'Permissions',
  icon: 'i-lucide-lock',
  to: '/admin/permissions'
}, {
  label: 'Settings',
  icon: 'i-lucide-settings',
  to: '/admin/settings'
}]] satisfies NavigationMenuItem[][]
</script>

<template>
  <UDashboardPanel id="admin">
    <template #header>
      <UDashboardNavbar title="Administration">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>

      <UDashboardToolbar>
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
