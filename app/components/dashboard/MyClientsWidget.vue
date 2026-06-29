<script setup lang="ts">
const { data, status } = await useFetch('/api/agency/clients')

const CAP = 5
// /api/agency/clients returns a bare array (not { clients }); tolerate both shapes.
const allClients = computed(() => Array.isArray(data.value) ? (data.value as any[]) : ((data.value as any)?.clients || []))
const clients = computed(() => allClients.value.slice(0, CAP))
const badges = computed(() => [{ label: `${allClients.value.length} total` }])

const formatCurrency = (v: number) =>
  new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v)
</script>

<template>
  <DashboardWidgetShell
    title="My Clients"
    icon="i-lucide-building-2"
    :badges="badges"
    to="/agency/clients"
    view-all-label="All clients"
    :loading="status === 'pending'"
    :is-empty="!clients.length"
    empty-text="No clients assigned"
    empty-icon="i-lucide-building-2"
    :more-count="Math.max(allClients.length - clients.length, 0)"
  >
    <div class="space-y-2">
      <NuxtLink
        v-for="client in clients"
        :key="client.id"
        :to="`/agency/clients/${client.id}`"
        class="flex items-center gap-3 p-2.5 rounded-lg border border-[var(--ui-border)] hover:border-[var(--ui-border-accented)] hover:bg-[var(--ui-bg-elevated)] transition-all"
      >
        <UAvatar :alt="client.name" size="sm" />
        <div class="flex-1 min-w-0">
          <p class="text-sm font-medium text-[var(--ui-text-highlighted)] truncate">{{ client.name }}</p>
          <p class="text-xs text-[var(--ui-text-muted)]">{{ client.activeProjects || 0 }} active projects</p>
        </div>
        <div class="text-right shrink-0">
          <p class="text-xs font-medium text-[var(--ui-text-highlighted)]">{{ formatCurrency(client.totalRevenue || 0) }}</p>
        </div>
      </NuxtLink>
    </div>
  </DashboardWidgetShell>
</template>
