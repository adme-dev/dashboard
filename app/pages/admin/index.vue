<template>
  <div class="h-full flex flex-col bg-gray-50">
    <div class="bg-white border-b px-6 py-4">
      <h1 class="text-2xl font-semibold">Administration</h1>
      <p class="text-gray-500 mt-1">
        Manage your account settings, users, teams, and more
      </p>
    </div>

    <div class="flex-1 overflow-auto p-6">
      <div class="grid grid-cols-3 gap-4 max-w-4xl">
        <UCard
          v-for="item in adminSections"
          :key="item.to"
          class="cursor-pointer hover:border-primary-400 transition-colors"
          @click="navigateTo(item.to)"
        >
          <div class="flex items-start gap-4">
            <div class="p-3 rounded-lg bg-primary-50">
              <UIcon :name="item.icon" class="w-6 h-6 text-primary-600" />
            </div>
            <div>
              <h3 class="font-semibold">{{ item.label }}</h3>
              <p class="text-sm text-gray-500 mt-1">{{ item.description }}</p>
            </div>
          </div>
        </UCard>
      </div>
    </div>
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
