<script setup lang="ts">
definePageMeta({ layout: 'admin', middleware: ['role-admin'] })

const integrations = [
  {
    label: 'Google Tag Manager',
    description: 'Manage OAuth health, client container bindings, live verification and change history.',
    icon: 'i-lucide-container',
    to: '/admin/connections/google-tag-manager',
    badge: 'Live'
  },
  {
    label: 'Dealer inventory feeds',
    description: 'Connect dealer inventory providers and map source feeds to client catalogues.',
    icon: 'i-lucide-rss',
    to: '/agency/dealer-feeds',
    badge: 'Live'
  },
  {
    label: 'AI assistants and MCP',
    description: 'Inspect the external assistant gateway, registered capability suites and owner authority.',
    icon: 'i-lucide-plug-zap',
    to: '/admin/ai/mcp',
    badge: 'Admin'
  }
]
</script>

<template>
  <UDashboardPanel>
    <UDashboardNavbar title="Integrations">
      <template #leading>
        <UDashboardSidebarCollapse />
      </template>
    </UDashboardNavbar>

    <div class="flex-1 overflow-y-auto p-4 sm:p-6">
      <div class="mx-auto max-w-5xl space-y-6">
        <header class="max-w-3xl">
          <p class="text-sm font-medium text-primary">
            Connected operations
          </p>
          <h1 class="mt-1 text-2xl font-semibold tracking-tight text-highlighted">
            Integration control room
          </h1>
          <p class="mt-2 text-sm leading-6 text-muted">
            Keep provider access, client bindings and automation surfaces healthy from one place. Secrets remain in deployment configuration and are never displayed here.
          </p>
        </header>

        <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
          <NuxtLink
            v-for="integration in integrations"
            :key="integration.to"
            :to="integration.to"
            class="group rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <UCard class="h-full transition group-hover:ring-1 group-hover:ring-primary/50">
              <div class="flex items-start gap-4">
                <div class="grid size-11 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                  <UIcon :name="integration.icon" class="size-5" />
                </div>
                <div class="min-w-0 flex-1">
                  <div class="flex items-center justify-between gap-3">
                    <h2 class="font-semibold text-highlighted">{{ integration.label }}</h2>
                    <UBadge color="neutral" variant="subtle" size="sm">{{ integration.badge }}</UBadge>
                  </div>
                  <p class="mt-1 text-sm leading-6 text-muted">{{ integration.description }}</p>
                  <div class="mt-4 flex items-center gap-1 text-sm font-medium text-primary">
                    Open controls
                    <UIcon name="i-lucide-arrow-right" class="size-4 transition-transform group-hover:translate-x-0.5" />
                  </div>
                </div>
              </div>
            </UCard>
          </NuxtLink>
        </div>
      </div>
    </div>
  </UDashboardPanel>
</template>
