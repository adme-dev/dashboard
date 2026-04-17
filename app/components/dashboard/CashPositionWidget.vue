<script setup lang="ts">
const { data, status } = useLazyFetch('/api/xero/reports/cash-flow-forecast', { server: false })

const cashData = computed(() => data.value as any)
const currentCash = computed(() => cashData.value?.currentCash || 0)
const forecast = computed(() => cashData.value?.forecast || [])
const shortfallDates = computed(() => cashData.value?.shortfallDates || [])

const formatCurrency = (v: number) =>
  new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v)

// Simple sparkline from forecast
const sparklineData = computed(() => forecast.value.slice(0, 30))
const maxVal = computed(() => Math.max(...sparklineData.value.map((d: any) => d.balance || d.value || 0), 1))
const minVal = computed(() => Math.min(...sparklineData.value.map((d: any) => d.balance || d.value || 0), 0))
const range = computed(() => maxVal.value - minVal.value || 1)
</script>

<template>
  <UCard>
    <template #header>
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-wallet" class="w-4 h-4 text-[var(--ui-text-muted)]" />
          <h3 class="font-semibold text-[var(--ui-text-highlighted)]">Cash Position</h3>
        </div>
        <UButton to="/cashflow" variant="link" color="neutral" size="xs" trailing-icon="i-lucide-arrow-right">
          Cashflow
        </UButton>
      </div>
    </template>

    <div v-if="status === 'pending'" class="space-y-3">
      <USkeleton class="h-10 w-32 rounded" />
      <USkeleton class="h-12 w-full rounded" />
    </div>
    <div v-else>
      <!-- Current cash -->
      <p class="text-3xl font-bold text-[var(--ui-text-highlighted)]">{{ formatCurrency(currentCash) }}</p>
      <p class="text-xs text-[var(--ui-text-muted)] mt-0.5">Current balance</p>

      <!-- Mini sparkline -->
      <div v-if="sparklineData.length" class="flex items-end gap-px h-12 mt-4">
        <div
          v-for="(point, i) in sparklineData"
          :key="i"
          class="flex-1 rounded-t min-h-[2px] transition-all"
          :class="(point.balance || point.value || 0) < 0 ? 'bg-red-400' : 'bg-emerald-400'"
          :style="{ height: `${(((point.balance || point.value || 0) - minVal) / range) * 100}%` }"
        />
      </div>
      <p v-if="sparklineData.length" class="text-[10px] text-[var(--ui-text-muted)] mt-1">30-day forecast</p>

      <!-- Shortfall warning -->
      <div v-if="shortfallDates.length" class="mt-3 p-2.5 rounded-lg bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20">
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-alert-triangle" class="w-4 h-4 text-red-500 shrink-0" />
          <p class="text-xs font-medium text-red-700 dark:text-red-400">
            Shortfall expected on {{ shortfallDates.length }} date{{ shortfallDates.length > 1 ? 's' : '' }}
          </p>
        </div>
      </div>
    </div>
  </UCard>
</template>
