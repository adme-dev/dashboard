<script setup lang="ts">
import { VisXYContainer, VisStackedBar, VisLine, VisArea, VisAxis, VisCrosshair, VisTooltip, VisDonut } from '@unovis/vue'

export type ChartSpec = {
  type: 'bar' | 'line' | 'donut' | 'stacked-bar'
  title?: string
  data: Array<Record<string, any>>
  xKey?: string
  yKeys?: string[]
  labels?: string[]
  colors?: string[]
}

const props = defineProps<{
  spec: ChartSpec
}>()

const containerRef = useTemplateRef<HTMLElement | null>('containerRef')
const { width: rawWidth } = useElementSize(containerRef)
const width = computed(() => Math.max(rawWidth.value, 100))

const palette = ['#2563eb', '#14b8a6', '#f97316', '#a855f7', '#22c55e', '#eab308', '#6366f1', '#ef4444']
const resolvedColors = computed(() => props.spec.colors || palette)

// Indexed data
type IndexedDatum = Record<string, any> & { _idx: number }
const indexedData = computed<IndexedDatum[]>(() =>
  props.spec.data.map((d, i) => ({ ...d, _idx: i }))
)

// Accessors
const xKey = computed(() => props.spec.xKey || 'label')
const yKeys = computed(() => {
  if (props.spec.yKeys?.length) return props.spec.yKeys
  // Auto-detect numeric keys (excluding label-like keys)
  const sample = props.spec.data[0]
  if (!sample) return ['value']
  return Object.keys(sample).filter(k => k !== xKey.value && typeof sample[k] === 'number')
})

const x = (d: IndexedDatum) => d._idx
const y = (key: string) => (d: IndexedDatum) => d[key] ?? 0

// Donut helpers
const donutValue = (d: IndexedDatum) => d[yKeys.value[0]] ?? d.value ?? 0
const donutColor = (d: IndexedDatum) => resolvedColors.value[d._idx % resolvedColors.value.length]
const donutTotal = computed(() => indexedData.value.reduce((s, d) => s + donutValue(d), 0))

// Tooltip
const fmtNum = (n: number) => {
  if (Math.abs(n) >= 1000) return '$' + Math.round(n).toLocaleString('en-AU')
  return n.toLocaleString('en-AU', { maximumFractionDigits: 1 })
}

const crosshairTemplate = (d: IndexedDatum) => {
  const lines = yKeys.value.map(k => `<div>${k}: ${fmtNum(d[k])}</div>`)
  return `<div class="text-xs"><strong>${d[xKey.value]}</strong>${lines.join('')}</div>`
}

const donutTooltip = (d: IndexedDatum) => {
  const pct = donutTotal.value > 0 ? ((donutValue(d) / donutTotal.value) * 100).toFixed(1) : '0'
  return `${d[xKey.value]}: ${fmtNum(donutValue(d))} (${pct}%)`
}

const xTick = (index: number) => {
  const d = indexedData.value[index]
  return d ? String(d[xKey.value] ?? index) : ''
}

const labels = computed(() => props.spec.labels || yKeys.value)
</script>

<template>
  <div ref="containerRef" class="my-3 rounded-lg bg-[var(--ui-bg-elevated)] border border-[var(--ui-border-accented)] overflow-hidden">
    <!-- Title -->
    <div v-if="spec.title" class="px-4 pt-3 pb-1">
      <h4 class="text-sm font-semibold">{{ spec.title }}</h4>
    </div>

    <!-- Donut -->
    <template v-if="spec.type === 'donut'">
      <div class="p-4 flex flex-col sm:flex-row sm:items-center gap-4">
        <div class="flex-1 flex justify-center" style="min-height: 160px">
          <VisDonut
            :data="indexedData"
            :value="donutValue"
            :color="donutColor"
            :central-label="fmtNum(donutTotal)"
            central-sub-label="Total"
            central-sub-label-wrap
          />
          <VisTooltip :template="donutTooltip" />
        </div>
        <ul class="flex-1 space-y-1.5">
          <li v-for="item in indexedData" :key="item._idx" class="flex items-center justify-between gap-2 text-sm">
            <div class="flex items-center gap-2">
              <span class="w-2.5 h-2.5 rounded-sm shrink-0" :style="{ background: resolvedColors[item._idx % resolvedColors.length] }" />
              <span class="truncate">{{ item[xKey] }}</span>
            </div>
            <span class="font-medium tabular-nums">{{ fmtNum(donutValue(item)) }}</span>
          </li>
        </ul>
      </div>
    </template>

    <!-- Bar / Stacked Bar -->
    <template v-else-if="spec.type === 'bar' || spec.type === 'stacked-bar'">
      <div class="h-56 px-2">
        <VisXYContainer
          :data="indexedData"
          :padding="{ top: 16, right: 12, bottom: 36, left: 48 }"
          :width="width - 16"
          class="h-full"
        >
          <VisStackedBar
            :x="x"
            :y="yKeys.map(k => y(k))"
            :color="yKeys.map((_k, i) => resolvedColors[i % resolvedColors.length])"
            :bar-padding="0.25"
          />
          <VisAxis type="x" :x="x" :tick-format="xTick" />
          <VisAxis type="y" />
          <VisCrosshair :template="crosshairTemplate" />
          <VisTooltip />
        </VisXYContainer>
      </div>
      <!-- Legend -->
      <div v-if="yKeys.length > 1" class="px-4 pb-2 flex flex-wrap gap-3 text-xs text-[var(--ui-text-muted)]">
        <div v-for="(lbl, i) in labels" :key="lbl" class="flex items-center gap-1.5">
          <span class="w-2.5 h-2.5 rounded-sm" :style="{ background: resolvedColors[i % resolvedColors.length] }" />
          {{ lbl }}
        </div>
      </div>
    </template>

    <!-- Line Chart -->
    <template v-else-if="spec.type === 'line'">
      <div class="h-56 px-2">
        <VisXYContainer
          :data="indexedData"
          :padding="{ top: 16, right: 12, bottom: 36, left: 48 }"
          :width="width - 16"
          class="h-full"
        >
          <VisArea
            v-if="yKeys.length === 1"
            :x="x"
            :y="y(yKeys[0])"
            :color="resolvedColors[0]"
            :opacity="0.12"
          />
          <VisLine
            v-for="(key, i) in yKeys"
            :key="key"
            :x="x"
            :y="y(key)"
            :color="resolvedColors[i % resolvedColors.length]"
          />
          <VisAxis type="x" :x="x" :tick-format="xTick" />
          <VisAxis type="y" />
          <VisCrosshair :template="crosshairTemplate" />
          <VisTooltip />
        </VisXYContainer>
      </div>
      <!-- Legend -->
      <div v-if="yKeys.length > 1" class="px-4 pb-2 flex flex-wrap gap-3 text-xs text-[var(--ui-text-muted)]">
        <div v-for="(lbl, i) in labels" :key="lbl" class="flex items-center gap-1.5">
          <span class="w-2.5 h-2.5 rounded-full" :style="{ background: resolvedColors[i % resolvedColors.length] }" />
          {{ lbl }}
        </div>
      </div>
    </template>
  </div>
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
</style>
