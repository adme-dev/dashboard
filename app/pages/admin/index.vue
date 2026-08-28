<template>
  <div>
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      <NuxtLink
        v-for="item in adminSections"
        :key="item.to"
        :to="item.to"
        class="block rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <UCard class="h-full hover:ring-1 hover:ring-primary transition-all">
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
      </NuxtLink>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'admin', middleware: ['role-admin'] })

const adminSections = [
  { label: 'Users', to: '/admin/users', icon: 'i-lucide-users', description: 'Manage team members and their roles' },
  { label: 'Teams', to: '/admin/teams', icon: 'i-lucide-users-round', description: 'Organize users into teams' },
  { label: 'Security', to: '/admin/security/auth', icon: 'i-lucide-shield', description: 'Authentication and audit logs' },
  { label: 'Billing', to: '/admin/billing/plans', icon: 'i-lucide-credit-card', description: 'Plans and invoices' },
  { label: 'Roles & Permissions', to: '/admin/permissions', icon: 'i-lucide-shield-check', description: 'Create custom roles and manage permission groups' },
  { label: 'Integrations', to: '/admin/connections/integrations', icon: 'i-lucide-plug-zap', description: 'Manage provider connections, health and client bindings' },
  { label: 'AI & MCP', to: '/admin/ai/mcp', icon: 'i-lucide-cpu', description: 'Inspect assistant gateway health and registered capability suites' },
  { label: 'AI Model Ops', to: '/admin/ai/model-ops', icon: 'i-lucide-brain-circuit', description: 'Review model routing, pricing coverage and AI surface risk' }
]
</script>
