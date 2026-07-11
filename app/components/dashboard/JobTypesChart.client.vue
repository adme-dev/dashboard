<script setup lang="ts">
const apiFetch = $fetch as <T = unknown>(request: string) => Promise<T>
const data = ref<any[] | { categories?: any[] } | null>(null)
const status = ref<'idle' | 'pending' | 'success' | 'error'>('idle')

async function refreshJobTypes() {
  status.value = 'pending'
  try {
    data.value = await apiFetch('/api/agency/briefs/categories')
    status.value = 'success'
  } catch (error) {
    console.error('Failed to load job types', error)
    status.value = 'error'
  }
}

await refreshJobTypes()

const categories = computed(() => {
  const raw = (data.value as any)?.categories || data.value || []
  if (!Array.isArray(raw)) return []
  // Endpoint emits briefCount (not count/amount); keep old names as defensive fallbacks.
  return raw.filter((c: any) => c && (c.briefCount ?? c.count ?? c.amount ?? 0) > 0)
})

const total = computed(() => categories.value.reduce((s: number, c: any) => s + (c.briefCount ?? c.count ?? c.amount ?? 0), 0))

const palette = ['#2563eb', '#14b8a6', '#f97316', '#a855f7', '#22c55e', '#eab308', '#6366f1', '#ef4444']

// SVG donut
const chartData = computed(() => {
  if (!categories.value.length || total.value === 0) return []
  let cumulative = 0
  return categories.value.map((c: any, i: number) => {
    const value = c.briefCount ?? c.count ?? c.amount ?? 0
    const pct = (value / total.value) * 100
    const start = cumulative
    cumulative += pct
    return {
      name: c.name || c.category || 'Unknown',
      value,
      percent: pct,
      startPercent: start,
      endPercent: cumulative,
      color: palette[i % palette.length],
    }
  })
})

const createArcPath = (startPct: number, endPct: number, inner = 55, outer = 80) => {
  const cx = 100, cy = 100
  const startAngle = (startPct / 100) * 2 * Math.PI - Math.PI / 2
  const endAngle = (endPct / 100) * 2 * Math.PI - Math.PI / 2
  const x1 = cx + outer * Math.cos(startAngle)
  const y1 = cy + outer * Math.sin(startAngle)
  const x2 = cx + outer * Math.cos(endAngle)
  const y2 = cy + outer * Math.sin(endAngle)
  const x3 = cx + inner * Math.cos(endAngle)
  const y3 = cy + inner * Math.sin(endAngle)
  const x4 = cx + inner * Math.cos(startAngle)
  const y4 = cy + inner * Math.sin(startAngle)
  const large = (endPct - startPct) > 50 ? 1 : 0
  return `M${x1},${y1} A${outer},${outer} 0 ${large} 1 ${x2},${y2} L${x3},${y3} A${inner},${inner} 0 ${large} 0 ${x4},${y4} Z`
}
</script>

<template>
  <UCard>
    <template #header>
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-pie-chart" class="w-4 h-4 text-[var(--ui-text-muted)]" />
          <h3 class="font-semibold text-[var(--ui-text-highlighted)]">Job Types</h3>
        </div>
        <UBadge variant="subtle" color="neutral" size="xs">{{ total }} briefs</UBadge>
      </div>
    </template>

    <div v-if="status === 'pending'" class="flex items-center justify-center h-[200px]">
      <USkeleton class="w-[160px] h-[160px] rounded-full" />
    </div>

    <div v-else-if="!chartData.length" class="text-center py-8">
      <p class="text-sm text-[var(--ui-text-muted)]">No brief categories found</p>
    </div>

    <div v-else class="flex items-start gap-4">
      <ClientOnly>
        <!-- Donut -->
        <div class="shrink-0 relative">
          <svg width="160" height="160" viewBox="0 0 200 200">
            <g>
              <path
                v-for="seg in chartData"
                :key="seg.name"
                :d="createArcPath(seg.startPercent, seg.endPercent)"
                :fill="seg.color"
                class="hover:opacity-80 transition-opacity cursor-pointer"
                stroke="var(--ui-bg)"
                stroke-width="1.5"
              />
            </g>
          </svg>
          <div class="absolute inset-0 flex flex-col items-center justify-center text-center">
            <span class="text-lg font-bold text-[var(--ui-text-highlighted)]">{{ total }}</span>
            <span class="text-[10px] text-[var(--ui-text-muted)]">Total</span>
          </div>
        </div>

        <!-- Legend -->
        <div class="flex-1 min-w-0 space-y-1.5 pt-1">
          <div
            v-for="seg in chartData.slice(0, 6)"
            :key="seg.name"
            class="flex items-center justify-between gap-2"
          >
            <div class="flex items-center gap-1.5 min-w-0">
              <span class="w-2.5 h-2.5 rounded shrink-0" :style="{ backgroundColor: seg.color }" />
              <span class="text-xs text-[var(--ui-text)] truncate">{{ seg.name }}</span>
            </div>
            <span class="text-xs font-medium text-[var(--ui-text-muted)] shrink-0">{{ seg.value }}</span>
          </div>
          <p v-if="chartData.length > 6" class="text-[10px] text-[var(--ui-text-muted)] pl-4">
            +{{ chartData.length - 6 }} more
          </p>
        </div>

        <template #fallback>
          <USkeleton class="w-[160px] h-[160px] rounded-full" />
        </template>
      </ClientOnly>
    </div>
  </UCard>
</template>
