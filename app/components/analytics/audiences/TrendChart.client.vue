<script setup lang="ts">
import { VisArea, VisAxis, VisCrosshair, VisLine, VisTooltip, VisXYContainer } from '@unovis/vue'
import type { AudienceMetric, AudienceSeriesPoint, AudienceTimeseriesResponse } from '~/types/audience-analytics'
import { formatAudienceMetric } from '~/utils/audienceAnalytics'

const props = defineProps<{
  data: AudienceTimeseriesResponse
  metric: AudienceMetric
}>()

const emit = defineEmits<{
  'update:metric': [value: AudienceMetric]
}>()

const metricOptions: Array<{ label: string, value: AudienceMetric }> = [
  { label: 'Visitors', value: 'visitors' },
  { label: 'Sessions', value: 'sessions' },
  { label: 'Engaged sessions', value: 'engagedSessions' },
  { label: 'Lead actions', value: 'leadActions' },
  { label: 'Confirmed leads', value: 'confirmedLeads' }
]

const metricModel = computed({
  get: () => props.metric,
  set: (value: AudienceMetric) => emit('update:metric', value)
})

type ChartPoint = {
  index: number
  currentDay: string
  previousDay: string
  current: number
  previous: number
}

const chartData = computed<ChartPoint[]>(() => {
  const length = Math.max(props.data.current.length, props.data.previous.length)
  return Array.from({ length }, (_, index) => {
    const current = props.data.current[index]
    const previous = props.data.previous[index]
    return {
      index,
      currentDay: current?.day ?? '',
      previousDay: previous?.day ?? '',
      current: current ? metricValue(current) : 0,
      previous: previous ? metricValue(previous) : 0
    }
  })
})

const hasActivity = computed(() => chartData.value.some(point => point.current > 0 || point.previous > 0))
const currentTotal = computed(() => chartData.value.reduce((sum, point) => sum + point.current, 0))
const previousTotal = computed(() => chartData.value.reduce((sum, point) => sum + point.previous, 0))

function metricValue(point: AudienceSeriesPoint): number {
  return point[props.metric]
}

const x = (point: ChartPoint) => point.index
const currentY = (point: ChartPoint) => point.current
const previousY = (point: ChartPoint) => point.previous
const xTick = (index: number) => chartData.value[index]?.currentDay.slice(5) ?? ''
const tooltip = (point: ChartPoint) => [
  `<strong>${point.currentDay || 'Current period'}</strong>: ${formatAudienceMetric(props.metric, point.current)}`,
  `<span>${point.previousDay || 'Prior period'}</span>: ${formatAudienceMetric(props.metric, point.previous)}`
].join('<br>')
</script>

<template>
  <UCard :ui="{ body: '!p-0', root: 'overflow-visible' }">
    <template #header>
      <div class="@container flex flex-col gap-4 @lg:flex-row @lg:items-end @lg:justify-between">
        <div>
          <p class="text-xs font-medium uppercase tracking-[0.18em] text-muted">Period comparison</p>
          <h2 class="mt-1 text-base font-semibold text-highlighted">Audience trend</h2>
        </div>
        <UFormField label="Metric" class="w-full @lg:w-56">
          <USelectMenu
            v-model="metricModel"
            :items="metricOptions"
            value-key="value"
            class="w-full"
          />
        </UFormField>
      </div>
    </template>

    <div v-if="chartData.length && hasActivity" class="h-80 px-3 pt-3 sm:px-5">
      <VisXYContainer :data="chartData" :padding="{ top: 20, right: 12, bottom: 36, left: 48 }" class="h-full">
        <VisArea :x="x" :y="currentY" color="var(--ui-primary)" :opacity="0.1" />
        <VisLine :x="x" :y="currentY" color="var(--ui-primary)" :line-width="2.5" />
        <VisLine
          :x="x"
          :y="previousY"
          color="var(--ui-text-dimmed)"
          :line-width="1.5"
          :line-dash-array="[6, 5]"
        />
        <VisAxis type="x" :x="x" :tick-format="xTick" />
        <VisAxis type="y" />
        <VisCrosshair color="var(--ui-primary)" :template="tooltip" />
        <VisTooltip />
      </VisXYContainer>
    </div>

    <div v-else class="flex h-80 flex-col items-center justify-center px-6 text-center">
      <UIcon name="i-lucide-chart-no-axes-combined" class="size-7 text-muted" />
      <p class="mt-3 text-sm font-medium">No trend activity in either window</p>
      <p class="mt-1 max-w-md text-sm text-muted">Try a longer date range or inspect tracking coverage above.</p>
    </div>

    <template #footer>
      <div class="flex flex-col gap-3 text-xs text-muted sm:flex-row sm:items-center sm:justify-between">
        <div class="flex flex-wrap gap-4">
          <span class="inline-flex items-center gap-2"><span class="h-0.5 w-5 bg-primary" /> Current window</span>
          <span class="inline-flex items-center gap-2"><span class="w-5 border-t border-dashed border-muted" /> Previous window</span>
        </div>
        <p class="tabular-nums">
          Current {{ formatAudienceMetric(metric, currentTotal) }} · Previous {{ formatAudienceMetric(metric, previousTotal) }}
        </p>
      </div>
    </template>
  </UCard>
</template>

<style scoped>
.unovis-xy-container {
  --vis-axis-grid-color: var(--ui-border);
  --vis-axis-tick-color: var(--ui-border);
  --vis-axis-tick-label-color: var(--ui-text-dimmed);
  --vis-tooltip-background-color: var(--ui-bg);
  --vis-tooltip-border-color: var(--ui-border);
  --vis-tooltip-text-color: var(--ui-text-highlighted);
}
</style>
