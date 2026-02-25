<script setup lang="ts">
const { data, status } = await useFetch('/api/agency/clients')

const clients = computed(() => {
  const raw = (data.value as any)?.clients || []
  return raw.slice(0, 8).map((c: any) => ({
    ...c,
    health: getHealth(c),
  }))
})

function getHealth(client: any) {
  const margin = client.grossMargin || 0
  const active = client.activeProjects || 0
  if (margin >= 30 && active > 0) return 'green'
  if (margin < 15 || active === 0) return 'red'
  return 'amber'
}

const healthColors: Record<string, string> = {
  green: 'bg-emerald-500',
  amber: 'bg-amber-500',
  red: 'bg-red-500',
}
const healthBg: Record<string, string> = {
  green: 'bg-emerald-50 dark:bg-emerald-500/10',
  amber: 'bg-amber-50 dark:bg-amber-500/10',
  red: 'bg-red-50 dark:bg-red-500/10',
}

const formatCurrency = (v: number) =>
  new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v)
</script>

<template>
  <UCard>
    <template #header>
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-heart-pulse" class="w-4 h-4 text-[var(--ui-text-muted)]" />
          <h3 class="font-semibold text-[var(--ui-text-highlighted)]">Client Health</h3>
        </div>
        <UButton to="/agency/clients" variant="link" color="neutral" size="xs" trailing-icon="i-lucide-arrow-right">
          All Clients
        </UButton>
      </div>
    </template>

    <div v-if="status === 'pending'" class="space-y-3">
      <USkeleton v-for="i in 5" :key="i" class="h-10 w-full rounded" />
    </div>
    <div v-else-if="!clients.length" class="text-center py-6 text-[var(--ui-text-muted)]">
      <UIcon name="i-lucide-heart-pulse" class="w-8 h-8 mx-auto mb-2 opacity-40" />
      <p class="text-sm">No client data available</p>
    </div>
    <div v-else class="divide-y divide-[var(--ui-border)]">
      <div v-for="client in clients" :key="client.id" class="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
        <div class="w-2 h-2 rounded-full shrink-0" :class="healthColors[client.health]" />
        <div class="flex-1 min-w-0">
          <p class="text-sm font-medium text-[var(--ui-text-highlighted)] truncate">{{ client.name }}</p>
          <p class="text-xs text-[var(--ui-text-muted)]">{{ client.activeProjects || 0 }} active projects</p>
        </div>
        <div class="text-right shrink-0">
          <p class="text-sm font-medium text-[var(--ui-text-highlighted)]">{{ formatCurrency(client.totalRevenue || 0) }}</p>
          <p class="text-xs" :class="(client.grossMargin || 0) >= 30 ? 'text-emerald-600 dark:text-emerald-400' : (client.grossMargin || 0) >= 15 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400'">
            {{ (client.grossMargin || 0).toFixed(1) }}% margin
          </p>
        </div>
      </div>
    </div>
  </UCard>
</template>
