<script setup lang="ts">
const { data, status } = await useFetch('/api/agency/social/spend/summary')

const now = new Date()
const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
const dayOfMonth = now.getDate()
const monthProgress = dayOfMonth / daysInMonth

const platforms = computed(() => {
  // Endpoint returns { items:[{platform, spend, budget}], totals }, not platforms/totalSpend.
  const raw = (data.value as any)?.items || (data.value as any)?.platforms || []
  if (Array.isArray(raw)) {
    return raw.map((p: any) => {
      const spent = p.spend ?? p.totalSpend ?? 0
      const budget = p.budget ?? p.totalBudget ?? 0
      const pacing = budget > 0 ? (spent / (budget * monthProgress)) * 100 : 0
      const projected = budget > 0 ? (spent / monthProgress) : 0
      return { ...p, spent, budget, pacing, projected }
    })
  }
  return []
})

function pacingColor(pacing: number) {
  if (pacing >= 80 && pacing <= 110) return 'bg-emerald-500'
  if (pacing >= 60 && pacing <= 120) return 'bg-amber-500'
  return 'bg-red-500'
}

function pacingLabel(pacing: number) {
  if (pacing >= 80 && pacing <= 110) return 'On Track'
  if (pacing > 110) return 'Over Pacing'
  return 'Under Pacing'
}

function pacingBadgeColor(pacing: number): string {
  if (pacing >= 80 && pacing <= 110) return 'success'
  if (pacing >= 60 && pacing <= 120) return 'warning'
  return 'error'
}

const formatCurrency = (v: number) =>
  new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v)
</script>

<template>
  <UCard>
    <template #header>
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-gauge" class="w-4 h-4 text-[var(--ui-text-muted)]" />
          <h3 class="font-semibold text-[var(--ui-text-highlighted)]">Spend Pacing</h3>
        </div>
        <UButton to="/agency/social/spend" variant="link" color="neutral" size="xs" trailing-icon="i-lucide-arrow-right">
          Details
        </UButton>
      </div>
    </template>

    <div v-if="status === 'pending'" class="space-y-4">
      <USkeleton v-for="i in 2" :key="i" class="h-16 w-full rounded" />
    </div>
    <div v-else-if="!platforms.length" class="text-center py-6 text-[var(--ui-text-muted)]">
      <UIcon name="i-lucide-gauge" class="w-8 h-8 mx-auto mb-2 opacity-40" />
      <p class="text-sm">No spend data available</p>
    </div>
    <div v-else class="space-y-4">
      <div v-for="platform in platforms" :key="platform.platform || platform.name" class="space-y-2">
        <div class="flex items-center justify-between">
          <span class="text-sm font-medium text-[var(--ui-text-highlighted)]">{{ platform.platform || platform.name }}</span>
          <UBadge :color="pacingBadgeColor(platform.pacing)" variant="subtle" size="xs">
            {{ pacingLabel(platform.pacing) }}
          </UBadge>
        </div>
        <div class="h-2 bg-[var(--ui-bg-elevated)] rounded-full overflow-hidden">
          <div class="h-full rounded-full transition-all duration-500" :class="pacingColor(platform.pacing)" :style="{ width: `${Math.min(platform.pacing, 100)}%` }" />
        </div>
        <div class="flex items-center justify-between text-xs text-[var(--ui-text-muted)]">
          <span>{{ formatCurrency(platform.spent) }} spent</span>
          <span>{{ formatCurrency(platform.budget) }} budget</span>
        </div>
        <p class="text-xs text-[var(--ui-text-muted)]">
          Projected: {{ formatCurrency(platform.projected) }}
        </p>
      </div>
    </div>
  </UCard>
</template>
