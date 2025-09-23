<script setup lang="ts">
// Temporarily disable Unovis to prevent initialization errors
// import { VisDonut, VisTooltip } from '@unovis/vue'

type BreakdownDatum = {
  name: string
  value: number
}

const cardRef = useTemplateRef<HTMLElement | null>('cardRef')

const props = defineProps<{
  items: BreakdownDatum[]
}>()

const palette = [
  '#2563eb',
  '#14b8a6',
  '#f97316',
  '#a855f7',
  '#22c55e',
  '#eab308',
  '#6366f1',
  '#ef4444'
]

type ChartDatum = BreakdownDatum & { index: number }

const data = computed<ChartDatum[]>(() => props.items.map((item, index) => ({
  ...item,
  index
})))

const total = computed(() => data.value.reduce((acc, item) => acc + item.value, 0))

const valueAccessor = (d: ChartDatum) => d.value
const colorAccessor = (d: ChartDatum) => palette[d.index % palette.length]

const formatCurrency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0
}).format

const tooltipTemplate = (d: ChartDatum) => {
  const percent = total.value === 0 ? 0 : (d.value / total.value) * 100
  return `${d.name}: ${formatCurrency(d.value)} (${percent.toFixed(1)}%)`
}
</script>

<template>
  <UCard ref="cardRef" :ui="{ body: '!p-0', root: 'overflow-visible' }">
    <template #header>
      <div>
        <p class="text-xs text-muted uppercase mb-1.5">
          Expense Mix
        </p>
        <p class="text-3xl text-highlighted font-semibold">
          {{ formatCurrency(total || 0) }}
        </p>
        <p class="text-muted text-xs">
          Share of expenses by category (latest period)
        </p>
      </div>
    </template>

    <div v-if="data.length" class="p-6 pt-0 flex flex-col lg:flex-row lg:items-center">
      <div class="flex-1 flex justify-center">
        <VisDonut
          :data="data"
          :value="valueAccessor"
          :color="colorAccessor"
          :central-label="formatCurrency(total || 0)"
          central-sub-label="Total"
          central-sub-label-wrap
        />
        <VisTooltip :template="tooltipTemplate" />
      </div>

      <ul class="flex-1 lg:pl-8 space-y-3 mt-6 lg:mt-0">
        <li
          v-for="item in data"
          :key="item.name"
          class="flex items-center justify-between gap-3"
        >
          <div class="flex items-center gap-2">
            <span class="legend-swatch" :style="{ background: colorAccessor(item) }" />
            <span class="text-sm text-highlighted">{{ item.name }}</span>
          </div>
          <div class="text-right">
            <div class="text-sm font-medium">
              {{ formatCurrency(item.value) }}
            </div>
            <div class="text-xs text-muted">
              {{ total === 0 ? '0.0%' : ((item.value / total) * 100).toFixed(1) + '%' }}
            </div>
          </div>
        </li>
      </ul>
    </div>

    <div v-else class="p-6 text-sm text-muted">
      No expense breakdown available for this range.
    </div>
  </UCard>
</template>

<style scoped>
.legend-swatch {
  width: 12px;
  height: 12px;
  border-radius: 4px;
}

.unovis-xy-container {
  --vis-tooltip-background-color: var(--ui-bg);
  --vis-tooltip-border-color: var(--ui-border);
  --vis-tooltip-text-color: var(--ui-text-highlighted);
}
</style>
