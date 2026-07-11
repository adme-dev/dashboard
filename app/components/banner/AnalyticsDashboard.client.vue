<script setup lang="ts">
import { VisXYContainer, VisLine, VisArea, VisAxis, VisCrosshair, VisTooltip } from '@unovis/vue'
import { FORMATS } from '~/utils/banner-constants'

const props = defineProps<{ projectId: string }>()
const apiFetch = $fetch as <T = unknown>(request: string, options?: { query?: Record<string, unknown> }) => Promise<T>

const chartRef = useTemplateRef<HTMLElement | null>('chartRef')
const { width } = useElementSize(chartRef)

// Date range presets
const rangeOptions = [
  { label: '7 days', value: '7' },
  { label: '30 days', value: '30' },
  { label: '90 days', value: '90' },
]
const selectedRange = ref('30')

const from = computed(() => {
  const days = Number(selectedRange.value) || 30
  return new Date(Date.now() - days * 86400000).toISOString().slice(0, 10)
})
const to = computed(() => new Date().toISOString().slice(0, 10))

// Fetch time-series data
const analytics = ref<any>({ series: [], totals: { impressions: 0, clicks: 0, ctr: '0.00' } })
const formats = ref<any[]>([])
const status = ref<'idle' | 'pending' | 'success' | 'error'>('idle')

async function fetchAnalytics() {
  status.value = 'pending'
  try {
    analytics.value = await apiFetch<any>('/api/agency/banner-studio/analytics', {
      query: { projectId: props.projectId, from: from.value, to: to.value },
    })
    status.value = 'success'
  } catch {
    analytics.value = { series: [], totals: { impressions: 0, clicks: 0, ctr: '0.00' } }
    status.value = 'error'
  }
}

async function fetchFormats() {
  try {
    formats.value = await apiFetch<any[]>('/api/agency/banner-studio/analytics/formats', {
      query: { projectId: props.projectId },
    })
  } catch {
    formats.value = []
  }
}

watch([from, to], () => {
  fetchAnalytics()
}, { immediate: true })

watch(() => props.projectId, () => {
  fetchAnalytics()
  fetchFormats()
}, { immediate: true })

// Chart data
type ChartDatum = { index: number; date: string; impressions: number; clicks: number }

const chartData = computed<ChartDatum[]>(() =>
  (analytics.value?.series || []).map((d: any, index: number) => ({
    index,
    date: d.date,
    impressions: Number(d.impressions || 0),
    clicks: Number(d.clicks || 0),
  })),
)

const x = (d: ChartDatum) => d.index
const impressionsY = (d: ChartDatum) => d.impressions
const clicksY = (d: ChartDatum) => d.clicks

const xTick = (index: number) => {
  const d = chartData.value[index]
  if (!d) return ''
  const date = new Date(d.date)
  return date.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
}

const crosshairTemplate = (d: ChartDatum) => `
  <div class="flex flex-col gap-0.5 text-xs">
    <strong>${new Date(d.date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}</strong>
    <span>Impressions: ${d.impressions.toLocaleString()}</span>
    <span>Clicks: ${d.clicks.toLocaleString()}</span>
    <span>CTR: ${d.impressions > 0 ? (d.clicks / d.impressions * 100).toFixed(2) : '0.00'}%</span>
  </div>
`

function fmtNumber(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`
  return String(n)
}
</script>

<template>
  <div class="space-y-5">
    <!-- KPI Cards -->
    <div class="grid grid-cols-3 gap-3">
      <div class="bg-(--ui-bg-elevated) border border-(--ui-border) rounded-lg p-4">
        <div class="text-[10px] font-bold uppercase tracking-wider text-(--ui-text-muted) mb-1">Impressions</div>
        <div class="text-2xl font-bold">{{ fmtNumber(analytics?.totals?.impressions || 0) }}</div>
      </div>
      <div class="bg-(--ui-bg-elevated) border border-(--ui-border) rounded-lg p-4">
        <div class="text-[10px] font-bold uppercase tracking-wider text-(--ui-text-muted) mb-1">Clicks</div>
        <div class="text-2xl font-bold">{{ fmtNumber(analytics?.totals?.clicks || 0) }}</div>
      </div>
      <div class="bg-(--ui-bg-elevated) border border-(--ui-border) rounded-lg p-4">
        <div class="text-[10px] font-bold uppercase tracking-wider text-(--ui-text-muted) mb-1">CTR</div>
        <div class="text-2xl font-bold">{{ analytics?.totals?.ctr || '0.00' }}%</div>
      </div>
    </div>

    <!-- Date range picker -->
    <div class="flex items-center gap-2">
      <UButton
        v-for="opt in rangeOptions"
        :key="opt.value"
        :label="opt.label"
        size="xs"
        :variant="selectedRange === opt.value ? 'soft' : 'ghost'"
        @click="selectedRange = opt.value"
      />
    </div>

    <!-- Time-series chart -->
    <div ref="chartRef" class="bg-(--ui-bg-elevated) border border-(--ui-border) rounded-lg p-4">
      <div v-if="status === 'pending'" class="h-48 flex items-center justify-center">
        <XfLoader size="sm" />
      </div>
      <div v-else-if="!chartData.length" class="h-48 flex items-center justify-center">
        <p class="text-xs text-(--ui-text-muted)">No data for this period</p>
      </div>
      <div v-else class="h-48">
        <VisXYContainer
          :data="chartData"
          :padding="{ top: 16, right: 8, bottom: 32, left: 40 }"
          :width="width - 32"
          class="h-full"
        >
          <VisArea
            :x="x"
            :y="impressionsY"
            color="var(--ui-primary)"
            :opacity="0.1"
          />
          <VisLine
            :x="x"
            :y="impressionsY"
            color="var(--ui-primary)"
          />
          <VisLine
            :x="x"
            :y="clicksY"
            color="var(--ui-warning)"
          />
          <VisAxis
            type="x"
            :x="x"
            :tick-format="xTick"
          />
          <VisAxis type="y" />
          <VisCrosshair
            color="var(--ui-primary)"
            :template="crosshairTemplate"
          />
          <VisTooltip />
        </VisXYContainer>
      </div>

      <!-- Legend -->
      <div class="flex gap-4 mt-2 text-[10px] text-(--ui-text-muted)">
        <div class="flex items-center gap-1.5">
          <span class="w-2.5 h-2.5 rounded-full bg-(--ui-primary)" />
          Impressions
        </div>
        <div class="flex items-center gap-1.5">
          <span class="w-2.5 h-2.5 rounded-full bg-(--ui-warning)" />
          Clicks
        </div>
      </div>
    </div>

    <!-- Per-format breakdown table -->
    <div class="bg-(--ui-bg-elevated) border border-(--ui-border) rounded-lg overflow-hidden">
      <div class="px-4 py-2.5 border-b border-(--ui-border)">
        <h3 class="text-xs font-bold uppercase tracking-wider text-(--ui-text-muted)">By Format</h3>
      </div>
      <div v-if="!formats?.length" class="px-4 py-6 text-center text-xs text-(--ui-text-muted)">
        No published formats yet
      </div>
      <table v-else class="w-full text-xs">
        <thead>
          <tr class="border-b border-(--ui-border)">
            <th class="text-left px-4 py-2 text-(--ui-text-muted) font-medium">Format</th>
            <th class="text-right px-4 py-2 text-(--ui-text-muted) font-medium">Impressions</th>
            <th class="text-right px-4 py-2 text-(--ui-text-muted) font-medium">Clicks</th>
            <th class="text-right px-4 py-2 text-(--ui-text-muted) font-medium">CTR</th>
            <th class="text-right px-4 py-2 text-(--ui-text-muted) font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="f in formats" :key="f.formatKey" class="border-b border-(--ui-border)/50 last:border-b-0">
            <td class="px-4 py-2">
              <span class="font-medium">{{ FORMATS[f.formatKey]?.name || f.formatKey }}</span>
              <span class="ml-1 text-(--ui-text-muted) font-mono text-[10px]">{{ f.width }}x{{ f.height }}</span>
            </td>
            <td class="text-right px-4 py-2 font-mono">{{ fmtNumber(f.impressions) }}</td>
            <td class="text-right px-4 py-2 font-mono">{{ fmtNumber(f.clicks) }}</td>
            <td class="text-right px-4 py-2 font-mono">{{ f.ctr }}%</td>
            <td class="text-right px-4 py-2">
              <UBadge :color="f.isLive ? 'success' : 'neutral'" variant="subtle" size="xs">
                {{ f.isLive ? 'Live' : 'Paused' }}
              </UBadge>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
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
