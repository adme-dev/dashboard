<template>
  <div class="flex-1 min-w-0">
    <UDashboardPanel>
      <UDashboardNavbar title="Administration">
        <template #trailing>
          <span class="text-sm text-muted font-normal">Manage your account settings, users, teams, and more</span>
        </template>
      </UDashboardNavbar>

      <div class="flex-1 overflow-y-auto p-4 sm:p-6">
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <UCard
            v-for="item in adminSections"
            :key="item.to"
            class="cursor-pointer hover:ring-1 hover:ring-primary transition-all"
            @click="navigateTo(item.to)"
          >
            <div class="flex items-start gap-4">
              <div class="p-3 rounded-lg bg-primary/10">
                <UIcon :name="item.icon" class="size-6 text-primary" />
              </div>
              <div>
                <h3 class="font-semibold text-highlighted">{{ item.label }}</h3>
                <p class="text-sm text-muted mt-1">{{ item.description }}</p>
              </div>
            </div>
          </UCard>
        </div>
      </div>
    </UDashboardPanel>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'admin' })

const adminSections = [
  { label: 'Users', to: '/admin/users', icon: 'i-lucide-users', description: 'Manage team members and their roles' },
  { label: 'Teams', to: '/admin/teams', icon: 'i-lucide-users-round', description: 'Organize users into teams' },
  { label: 'Security', to: '/admin/security/auth', icon: 'i-lucide-shield', description: 'Authentication and audit logs' },
  { label: 'Billing', to: '/admin/billing/plans', icon: 'i-lucide-credit-card', description: 'Plans and invoices' },
  { label: 'Connections', to: '/admin/connections/integrations', icon: 'i-lucide-plug', description: 'Integrations and API settings' },
  { label: 'Permissions', to: '/admin/permissions', icon: 'i-lucide-lock', description: 'Access control settings' },
]
</script>
