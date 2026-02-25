<script setup lang="ts">
const { data, status } = await useFetch('/api/agency/social/spend/summary')

const spendData = computed(() => data.value as any)

const platforms = computed(() => {
  if (!spendData.value) return []
  const items: { name: string; icon: string; spend: number; budget: number; color: string }[] = []
  if (spendData.value.meta) {
    items.push({
      name: 'Meta Ads',
      icon: 'i-lucide-facebook',
      spend: spendData.value.meta.totalSpend || 0,
      budget: spendData.value.meta.totalBudget || 0,
      color: '#1877F2',
    })
  }
  if (spendData.value.google) {
    items.push({
      name: 'Google Ads',
      icon: 'i-lucide-chrome',
      spend: spendData.value.google.totalSpend || 0,
      budget: spendData.value.google.totalBudget || 0,
      color: '#4285F4',
    })
  }
  return items
})

const totalSpend = computed(() => platforms.value.reduce((s, p) => s + p.spend, 0))
const totalBudget = computed(() => platforms.value.reduce((s, p) => s + p.budget, 0))

const formatCurrency = (v: number) =>
  new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(v)

const spendPercent = (spend: number, budget: number) => {
  if (!budget) return 0
  return Math.min(100, Math.round((spend / budget) * 100))
}
</script>

<template>
  <UCard>
    <template #header>
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-megaphone" class="w-4 h-4 text-[var(--ui-text-muted)]" />
          <h3 class="font-semibold text-[var(--ui-text-highlighted)]">Ad Spend</h3>
        </div>
        <UButton to="/agency/social/spend" variant="link" color="neutral" size="xs" trailing-icon="i-lucide-arrow-right">
          Details
        </UButton>
      </div>
    </template>

    <div v-if="status === 'pending'" class="space-y-3">
      <USkeleton class="h-12 rounded" />
      <USkeleton class="h-12 rounded" />
    </div>

    <div v-else-if="!platforms.length" class="text-center py-6">
      <p class="text-sm text-[var(--ui-text-muted)]">No ad accounts connected</p>
      <UButton to="/agency/social" variant="link" color="primary" size="xs" class="mt-1">
        Connect accounts
      </UButton>
    </div>

    <div v-else class="space-y-3">
      <!-- Total -->
      <div class="flex items-center justify-between pb-2 border-b border-[var(--ui-border)]">
        <span class="text-xs text-[var(--ui-text-muted)]">Total Spend</span>
        <span class="text-lg font-bold text-[var(--ui-text-highlighted)]">{{ formatCurrency(totalSpend) }}</span>
      </div>

      <!-- Per-platform -->
      <div v-for="p in platforms" :key="p.name" class="space-y-1.5">
        <div class="flex items-center justify-between text-sm">
          <div class="flex items-center gap-2">
            <span class="w-2 h-2 rounded-full" :style="{ backgroundColor: p.color }" />
            <span class="text-[var(--ui-text)]">{{ p.name }}</span>
          </div>
          <span class="font-medium text-[var(--ui-text-highlighted)]">{{ formatCurrency(p.spend) }}</span>
        </div>
        <div v-if="p.budget > 0" class="flex items-center gap-2">
          <div class="flex-1 h-1.5 bg-[var(--ui-bg-elevated)] rounded-full overflow-hidden">
            <div
              class="h-full rounded-full transition-all duration-500"
              :class="spendPercent(p.spend, p.budget) > 90 ? 'bg-red-500' : spendPercent(p.spend, p.budget) > 70 ? 'bg-amber-500' : 'bg-emerald-500'"
              :style="{ width: `${spendPercent(p.spend, p.budget)}%` }"
            />
          </div>
          <span class="text-[10px] text-[var(--ui-text-muted)] shrink-0 tabular-nums">
            {{ spendPercent(p.spend, p.budget) }}% of {{ formatCurrency(p.budget) }}
          </span>
        </div>
      </div>
    </div>
  </UCard>
</template>
