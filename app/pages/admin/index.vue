<template>
  <div>
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
</template>

<script setup lang="ts">
definePageMeta({ middleware: ['role-admin'] })

const adminSections = [
  { label: 'Users', to: '/admin/users', icon: 'i-lucide-users', description: 'Manage team members and their roles' },
  { label: 'Teams', to: '/admin/teams', icon: 'i-lucide-users-round', description: 'Organize users into teams' },
  { label: 'Security', to: '/admin/security/auth', icon: 'i-lucide-shield', description: 'Authentication and audit logs' },
  { label: 'Billing', to: '/admin/billing/plans', icon: 'i-lucide-credit-card', description: 'Plans and invoices' },
  { label: 'Connections', to: '/admin/connections/integrations', icon: 'i-lucide-plug', description: 'Integrations and API settings' },
  { label: 'Permissions', to: '/admin/permissions', icon: 'i-lucide-lock', description: 'Access control settings' },
]
</script>
