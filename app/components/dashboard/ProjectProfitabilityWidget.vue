<script setup lang="ts">
const { data, status } = await useFetch('/api/agency/projects/profitability')

// Endpoint returns commission-based profitability grouped by client: { clients, summary }.
const CAP = 5
const profitData = computed(() => data.value as any)
const allProjects = computed(() => (profitData.value?.clients || []))
const projects = computed(() => allProjects.value.slice(0, CAP))
const avgMargin = computed(() => profitData.value?.summary?.avgMargin || 0)
const atRiskCount = computed(() => allProjects.value.filter((p: any) => (p.margin || 0) < 15).length)
const badges = computed(() => {
  const out: { label: string | number, color?: any }[] = [{
    label: `${avgMargin.value.toFixed(1)}% avg margin`,
    color: avgMargin.value >= 30 ? 'success' : avgMargin.value >= 15 ? 'warning' : 'error',
  }]
  if (atRiskCount.value) out.push({ label: `${atRiskCount.value} at risk`, color: 'error' })
  return out
})

const formatCurrency = (v: number) =>
  new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v)

// Bar size = managed media spend (the volume metric).
const maxSpend = computed(() => Math.max(...projects.value.map((p: any) => p.spend || 0), 1))

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
  <DashboardWidgetShell
    title="Project Profitability"
    icon="i-lucide-calculator"
    :badges="badges"
    to="/agency/projects"
    view-all-label="All projects"
    :loading="status === 'pending'"
    :is-empty="!projects.length"
    empty-text="No profitability data"
    empty-icon="i-lucide-calculator"
    :more-count="Math.max(allProjects.length - projects.length, 0)"
  >
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
              :style="{ width: `${Math.min(((project.spend || 0) / maxSpend) * 100, 100)}%` }"
            />
          </div>
          <div class="flex justify-between text-[10px] text-[var(--ui-text-muted)]">
            <span>{{ formatCurrency(project.spend || 0) }} spend</span>
            <span>{{ formatCurrency(project.commission || 0) }} commission</span>
          </div>
        </div>
      </div>
  </DashboardWidgetShell>
</template>
