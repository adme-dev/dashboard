<script setup lang="ts">
const { data, status } = useLazyFetch('/api/xero/reports/pnl', { server: false })

const pnl = computed(() => data.value as any)

const formatCurrency = (v: number) =>
  new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v)

const metrics = computed(() => {
  const revenue = pnl.value?.revenueTotal || pnl.value?.revenue || 0
  const expenses = pnl.value?.expensesTotal || pnl.value?.expenses || 0
  const netProfit = pnl.value?.netProfit || revenue - expenses
  const margin = revenue > 0 ? (netProfit / revenue) * 100 : 0

  return [
    { label: 'Revenue', value: formatCurrency(revenue), icon: 'i-lucide-dollar-sign', color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-500/10' },
    { label: 'Expenses', value: formatCurrency(expenses), icon: 'i-lucide-receipt', color: 'text-orange-600 dark:text-orange-400', bg: 'bg-orange-50 dark:bg-orange-500/10' },
    { label: 'Net Profit', value: formatCurrency(netProfit), icon: 'i-lucide-piggy-bank', color: netProfit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400', bg: netProfit >= 0 ? 'bg-emerald-50 dark:bg-emerald-500/10' : 'bg-red-50 dark:bg-red-500/10' },
    { label: 'Margin', value: `${margin.toFixed(1)}%`, icon: 'i-lucide-percent', color: margin >= 30 ? 'text-emerald-600 dark:text-emerald-400' : margin >= 15 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400', bg: margin >= 30 ? 'bg-emerald-50 dark:bg-emerald-500/10' : margin >= 15 ? 'bg-amber-50 dark:bg-amber-500/10' : 'bg-red-50 dark:bg-red-500/10' },
  ]
})
</script>

<template>
  <UCard>
    <template #header>
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-trending-up" class="w-4 h-4 text-[var(--ui-text-muted)]" />
          <h3 class="font-semibold text-[var(--ui-text-highlighted)]">Revenue Snapshot</h3>
        </div>
        <UButton to="/profit-loss" variant="link" color="neutral" size="xs" trailing-icon="i-lucide-arrow-right">
          Full P&L
        </UButton>
      </div>
    </template>

    <div v-if="status === 'pending'" class="grid grid-cols-2 gap-3">
      <USkeleton v-for="i in 4" :key="i" class="h-16 rounded" />
    </div>
    <div v-else class="grid grid-cols-2 gap-3">
      <div v-for="m in metrics" :key="m.label" class="flex items-center gap-2.5 p-3 rounded-lg bg-[var(--ui-bg-elevated)]">
        <div class="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center" :class="m.bg">
          <UIcon :name="m.icon" class="w-4 h-4" :class="m.color" />
        </div>
        <div class="min-w-0">
          <p class="text-xs text-[var(--ui-text-muted)]">{{ m.label }}</p>
          <p class="text-sm font-semibold text-[var(--ui-text-highlighted)] truncate">{{ m.value }}</p>
        </div>
      </div>
    </div>
  </UCard>
</template>
