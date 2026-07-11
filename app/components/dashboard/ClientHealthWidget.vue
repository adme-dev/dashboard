<script setup lang="ts">
const apiFetch = $fetch as <T = unknown>(request: string) => Promise<T>
const data = ref<any[] | { clients?: any[] } | null>(null)
const status = ref<'idle' | 'pending' | 'success' | 'error'>('idle')

async function refreshClientHealth() {
  status.value = 'pending'
  try {
    data.value = await apiFetch('/api/agency/clients')
    status.value = 'success'
  } catch (error) {
    console.error('Failed to load client health', error)
    status.value = 'error'
  }
}

await refreshClientHealth()

const CAP = 5
// /api/agency/clients returns a bare array (not { clients }); tolerate both shapes.
const allClients = computed(() => {
  const raw = Array.isArray(data.value) ? (data.value as any[]) : ((data.value as any)?.clients || [])
  return raw.map((c: any) => ({ ...c, health: getHealth(c) }))
})
const clients = computed(() => allClients.value.slice(0, CAP))
const badges = computed(() => {
  const atRisk = allClients.value.filter((c: any) => c.health === 'red').length
  const out: { label: string | number, color?: any }[] = [{ label: `${allClients.value.length} total` }]
  if (atRisk) out.push({ label: `${atRisk} at risk`, color: 'error' })
  return out
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
  <DashboardWidgetShell
    title="Client Health"
    icon="i-lucide-heart-pulse"
    :badges="badges"
    to="/agency/clients"
    view-all-label="All clients"
    :loading="status === 'pending'"
    :is-empty="!clients.length"
    empty-text="No client data available"
    empty-icon="i-lucide-heart-pulse"
    :more-count="Math.max(allClients.length - clients.length, 0)"
  >
    <div class="divide-y divide-[var(--ui-border)]">
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
  </DashboardWidgetShell>
</template>
