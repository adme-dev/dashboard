<script setup lang="ts">
import { VisXYContainer, VisLine, VisArea, VisAxis, VisCrosshair, VisTooltip } from '@unovis/vue'

type PeriodDatum = {
  label: string
  revenue: number
  expenses: number
  netProfit: number
  profitMargin: number
}

const cardRef = useTemplateRef<HTMLElement | null>('cardRef')

const props = defineProps<{
  periods: PeriodDatum[]
}>()

const { width } = useElementSize(cardRef)

type ChartDatum = PeriodDatum & { index: number }

const data = computed<ChartDatum[]>(() => props.periods.map((period, index) => ({
  ...period,
  index
})))

const x = (d: ChartDatum) => d.index
const revenueY = (d: ChartDatum) => d.revenue
const expensesY = (d: ChartDatum) => d.expenses
const netProfitY = (d: ChartDatum) => d.netProfit

const formatCurrency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0
}).format

const crosshairTemplate = (d: ChartDatum) => `
  <div class="flex flex-col gap-1">
    <strong>${d.label}</strong>
    <span>Revenue: ${formatCurrency(d.revenue)}</span>
    <span>Expenses: ${formatCurrency(d.expenses)}</span>
    <span>Net Profit: ${formatCurrency(d.netProfit)}</span>
    <span>Margin: ${(d.profitMargin * 100).toFixed(1)}%</span>
  </div>
`

const xTick = (index: number) => data.value[index]?.label ?? ''
</script>

<template>
  <UCard ref="cardRef" :ui="{ body: '!p-0', root: 'overflow-visible' }">
    <template #header>
      <div>
        <p class="text-xs text-muted uppercase mb-1.5">
          Profit Trend
        </p>
        <p class="text-3xl text-highlighted font-semibold">
          {{ formatCurrency(data[data.length - 1]?.netProfit || 0) }}
        </p>
        <p class="text-muted text-xs">
          Net profit change across reporting periods
        </p>
      </div>
    </template>

    <div class="h-96">
      <VisXYContainer
        :data="data"
        :padding="{ top: 40, right: 16, bottom: 40, left: 48 }"
        :width="width"
        class="h-full"
      >
        <VisArea
          :x="x"
          :y="netProfitY"
          color="var(--ui-positive)"
          :opacity="0.15"
        />

        <VisLine
          :x="x"
          :y="revenueY"
          color="var(--ui-primary)"
        />

        <VisLine
          :x="x"
          :y="expensesY"
          color="var(--ui-warning)"
        />

        <VisAxis
          type="x"
          :x="x"
          :tick-format="xTick"
          :padding="{ start: 12, end: 12 }"
        />

        <VisAxis type="y" />

        <VisCrosshair
          color="var(--ui-primary)"
          :template="crosshairTemplate"
        />

        <VisTooltip />
      </VisXYContainer>
    </div>

    <template #footer>
      <div class="flex flex-wrap gap-4 text-xs text-muted">
        <div class="flex items-center gap-2">
          <span class="legend-dot legend-dot--primary" />
          Revenue
        </div>
        <div class="flex items-center gap-2">
          <span class="legend-dot legend-dot--warning" />
          Expenses
        </div>
        <div class="flex items-center gap-2">
          <span class="legend-dot legend-dot--positive" />
          Net profit area
        </div>
      </div>
    </template>
  </UCard>
</template>

<style scoped>
.unovis-xy-container {
  --vis-crosshair-line-stroke-color: var(--ui-primary);
  --vis-crosshair-circle-stroke-color: var(--ui-bg);

  --vis-axis-grid-color: var(--ui-border);
  --vis-axis-tick-color: var(--ui-border);
  --vis-axis-tick-label-color: var(--ui-text-dimmed);

  --vis-tooltip-background-color: var(--ui-bg);
  --vis-tooltip-border-color: var(--ui-border);
  --vis-tooltip-text-color: var(--ui-text-highlighted);
}

.legend-dot {
  width: 10px;
  height: 10px;
  border-radius: 9999px;
  display: inline-block;
}

.legend-dot--primary {
  background: var(--ui-primary);
}

.legend-dot--warning {
  background: var(--ui-warning);
}

.legend-dot--positive {
  background: var(--ui-positive);
}
</style>
