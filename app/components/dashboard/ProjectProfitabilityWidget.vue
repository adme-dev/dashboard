<script setup lang="ts">
const { data, status } = await useFetch('/api/agency/projects/profitability')

const profitData = computed(() => data.value as any)
const projects = computed(() => (profitData.value?.projects || []).slice(0, 6))
const avgMargin = computed(() => profitData.value?.summary?.avgMargin || 0)
const atRiskCount = computed(() => projects.value.filter((p: any) => (p.margin || 0) < 15).length)

const formatCurrency = (v: number) =>
  new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v)

const maxRevenue = computed(() => Math.max(...projects.value.map((p: any) => p.revenue || 0), 1))

function marginColor(margin: number) {
  if (margin >= 30) return 'text-emerald-600 dark:text-emerald-400'
  if (margin >= 15) return 'text-amber-600 dark:text-amber-400'
  return 'text-red-600 dark:text-red-400'
}

function barColor(margin: number) {
  if (margin >= 30) return 'bg-emerald-500'
  if (margin >= 15) return 'bg-amber-500'
  return 'bg-red-500'
}
</script>

<template>
  <UCard>
    <template #header>
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-calculator" class="w-4 h-4 text-[var(--ui-text-muted)]" />
          <h3 class="font-semibold text-[var(--ui-text-highlighted)]">Project Profitability</h3>
        </div>
        <UButton to="/agency/projects" variant="link" color="neutral" size="xs" trailing-icon="i-lucide-arrow-right">
          All Projects
        </UButton>
      </div>
    </template>

    <div v-if="status === 'pending'" class="space-y-3">
      <USkeleton v-for="i in 4" :key="i" class="h-12 w-full rounded" />
    </div>
    <div v-else-if="!projects.length" class="text-center py-6 text-[var(--ui-text-muted)]">
      <UIcon name="i-lucide-calculator" class="w-8 h-8 mx-auto mb-2 opacity-40" />
      <p class="text-sm">No profitability data</p>
    </div>
    <div v-else>
      <!-- Summary -->
      <div class="flex items-center gap-4 mb-4">
        <div class="flex items-center gap-1.5">
          <span class="text-xs text-[var(--ui-text-muted)]">Avg margin:</span>
          <span class="text-sm font-semibold" :class="marginColor(avgMargin)">{{ avgMargin.toFixed(1) }}%</span>
        </div>
        <div v-if="atRiskCount" class="flex items-center gap-1.5">
          <span class="text-xs text-[var(--ui-text-muted)]">At risk:</span>
          <UBadge color="error" variant="subtle" size="xs">{{ atRiskCount }}</UBadge>
        </div>
      </div>

      <!-- Project bars -->
      <div class="space-y-3">
        <div v-for="project in projects" :key="project.id || project.name" class="space-y-1">
          <div class="flex items-center justify-between">
            <span class="text-sm text-[var(--ui-text-highlighted)] truncate flex-1">{{ project.name }}</span>
            <span class="text-xs font-medium shrink-0 ml-2" :class="marginColor(project.margin || 0)">
              {{ (project.margin || 0).toFixed(1) }}%
            </span>
          </div>
          <div class="h-1.5 bg-[var(--ui-bg-elevated)] rounded-full overflow-hidden">
            <div
              class="h-full rounded-full transition-all duration-500"
              :class="barColor(project.margin || 0)"
              :style="{ width: `${Math.min(((project.revenue || 0) / maxRevenue) * 100, 100)}%` }"
            />
          </div>
          <div class="flex justify-between text-[10px] text-[var(--ui-text-muted)]">
            <span>{{ formatCurrency(project.revenue || 0) }} revenue</span>
            <span>{{ formatCurrency(project.cost || 0) }} cost</span>
          </div>
        </div>
      </div>
    </div>
  </UCard>
</template>
