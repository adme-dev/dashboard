<script setup lang="ts">
const { data, status } = await useFetch('/api/agency/clients')

const clients = computed(() => {
  // /api/agency/clients returns a bare array (not { clients }); tolerate both shapes.
  const raw = Array.isArray(data.value) ? (data.value as any[]) : ((data.value as any)?.clients || [])
  return raw.slice(0, 6)
})

const formatCurrency = (v: number) =>
  new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v)
</script>

<template>
  <UCard>
    <template #header>
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-building-2" class="w-4 h-4 text-[var(--ui-text-muted)]" />
          <h3 class="font-semibold text-[var(--ui-text-highlighted)]">My Clients</h3>
        </div>
        <UButton to="/agency/clients" variant="link" color="neutral" size="xs" trailing-icon="i-lucide-arrow-right">
          All Clients
        </UButton>
      </div>
    </template>

    <div v-if="status === 'pending'" class="space-y-3">
      <USkeleton v-for="i in 4" :key="i" class="h-12 w-full rounded" />
    </div>
    <div v-else-if="!clients.length" class="text-center py-6 text-[var(--ui-text-muted)]">
      <UIcon name="i-lucide-building-2" class="w-8 h-8 mx-auto mb-2 opacity-40" />
      <p class="text-sm">No clients assigned</p>
    </div>
    <div v-else class="space-y-2">
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
  </UCard>
</template>
