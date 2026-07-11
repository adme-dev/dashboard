<!-- app/components/agency/BlendedPanel.client.vue -->
<script setup lang="ts">
import { presetColumnKeys, ALL_PRESET_SENTINEL, type BlendMetric } from '~~/app/utils/blendPresetColumns'
// Blended cross-channel metrics by canonical channel (Meta + Google + GA4).
// clientId is optional — omit for an agency-wide blend.
const props = defineProps<{ startDate: string, endDate: string, clientId?: string | null }>()
const { fmtCurrency, fmtCompact } = useAnalytics()
const apiFetch = $fetch as <T = unknown>(request: string, options?: { query?: Record<string, unknown> }) => Promise<T>

interface BlendedRow {
  channel: string
  spend: number
  leads: number
  conversions: number
  revenue: number
  sessions: number
  cpl: number | null
  cpa: number | null
  roas: number | null
}
type ComparedMetric = 'spend' | 'leads' | 'conversions' | 'revenue' | 'sessions'
interface BlendedComparison { totals: BlendedRow, deltaPct: Record<ComparedMetric, number | null> }
interface BlendedResponse {
  channels: BlendedRow[]
  totals: BlendedRow
  comparison?: BlendedComparison
  hasGa4: boolean
  conversionBasis: string
}

const query = computed(() => {
  const q: Record<string, string> = {
    startDate: props.startDate,
    endDate: props.endDate,
  }
  if (props.clientId) q.clientId = props.clientId
  return q
})

const data = ref<BlendedResponse | null>(null)
const pending = ref(false)

async function refreshBlended() {
  pending.value = true
  try {
    data.value = await apiFetch<BlendedResponse>('/api/agency/analytics/blended', { query: query.value })
  } catch {
    data.value = null
  } finally {
    pending.value = false
  }
}

watch(query, () => {
  refreshBlended()
}, { immediate: true })

const hasData = computed(() => !pending.value && !!data.value && data.value.channels.length > 0)

interface BlendPreset {
  id: string
  label: string
  description: string
  metrics: BlendMetric[]
  attributionModel: string
}

const ALL_COLUMNS = [
  { accessorKey: 'channel', header: 'Channel' },
  { accessorKey: 'spend', header: 'Spend' },
  { accessorKey: 'leads', header: 'Leads' },
  { accessorKey: 'cpl', header: 'CPL' },
  { accessorKey: 'conversions', header: 'Conversions' },
  { accessorKey: 'cpa', header: 'CPA' },
  { accessorKey: 'revenue', header: 'Revenue' },
  { accessorKey: 'roas', header: 'ROAS' },
  { accessorKey: 'sessions', header: 'Sessions' }
]

// Non-blocking: presets only back the view dropdown; don't suspend the table on them.
const presetData = ref<{ presets: BlendPreset[] } | null>(null)
apiFetch<{ presets: BlendPreset[] }>('/api/agency/analytics/presets')
  .then(result => { presetData.value = result })
  .catch(() => { presetData.value = { presets: [] } })

const selectedPreset = ref<string>(ALL_PRESET_SENTINEL)
const presetItems = computed(() => [
  { label: 'All metrics', value: ALL_PRESET_SENTINEL },
  ...(presetData.value?.presets ?? []).map(p => ({ label: p.label, value: p.id }))
])

const activePreset = computed<BlendPreset | null>(() =>
  selectedPreset.value === ALL_PRESET_SENTINEL
    ? null
    : presetData.value?.presets.find(p => p.id === selectedPreset.value) ?? null
)

const ATTRIBUTION_LABELS: Record<string, string> = {
  last: 'Last-click attribution',
  first: 'First-click attribution',
  linear: 'Linear attribution',
  position: 'Position-based attribution',
  time_decay: 'Time-decay attribution'
}
const attributionCaption = computed(() =>
  activePreset.value ? (ATTRIBUTION_LABELS[activePreset.value.attributionModel] ?? null) : null
)

const visibleKeys = computed(() =>
  presetColumnKeys(activePreset.value ? activePreset.value.metrics : ALL_PRESET_SENTINEL)
)
const columns = computed(() => ALL_COLUMNS.filter(c => visibleKeys.value.includes(c.accessorKey)))

function tableRow(row: unknown): BlendedRow {
  return ((row as { original?: BlendedRow }).original ?? row) as BlendedRow
}

function fmtMoney(v: number | null): string {
  return v === null ? '—' : fmtCurrency(v)
}
function fmtRoas(v: number | null): string {
  return v === null ? '—' : `${v.toFixed(2)}x`
}
function deltaOf(metric: ComparedMetric): number | null {
  return data.value?.comparison?.deltaPct?.[metric] ?? null
}
function fmtDelta(v: number | null): string {
  if (v === null) return ''
  const arrow = v >= 0 ? '▲' : '▼'
  return `${arrow} ${Math.abs(v * 100).toFixed(0)}%`
}
function deltaClass(metric: ComparedMetric): string {
  const v = deltaOf(metric)
  if (v === null || v === 0) return 'text-muted'
  return v > 0 ? 'text-success' : 'text-error'
}
</script>

<template>
  <UCard v-if="hasData">
    <template #header>
      <div class="flex items-center justify-between gap-2">
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-layers" class="text-primary" />
          <span class="font-semibold">Blended Channels</span>
          <UTooltip text="Spend, GA4 sessions and owned leads blended onto one canonical-channel axis. Conversions & ROAS are platform-reported (each platform's own counting), not deduplicated cross-platform.">
            <UIcon name="i-lucide-info" class="text-muted" />
          </UTooltip>
        </div>
        <div class="flex flex-col items-end">
          <USelectMenu
            v-model="selectedPreset"
            :items="presetItems"
            value-key="value"
            size="xs"
            class="w-48"
          />
          <span v-if="attributionCaption" class="text-xs text-muted mt-1">{{ attributionCaption }}</span>
        </div>
      </div>
    </template>

    <!-- Top-line blended totals -->
    <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
      <div class="rounded-lg bg-elevated p-4">
        <p class="text-xs text-muted">
          Spend
        </p>
        <p class="text-xl font-semibold">
          {{ fmtCurrency(data!.totals.spend) }}
        </p>
        <p v-if="deltaOf('spend') !== null" :class="deltaClass('spend')" class="text-xs mt-1">
          {{ fmtDelta(deltaOf('spend')) }}
        </p>
      </div>
      <div class="rounded-lg bg-elevated p-4">
        <p class="text-xs text-muted">
          Leads
        </p>
        <p class="text-xl font-semibold">
          {{ fmtCompact(data!.totals.leads) }}
        </p>
        <p v-if="deltaOf('leads') !== null" :class="deltaClass('leads')" class="text-xs mt-1">
          {{ fmtDelta(deltaOf('leads')) }}
        </p>
      </div>
      <div class="rounded-lg bg-elevated p-4">
        <p class="text-xs text-muted">
          Blended CPL
        </p>
        <p class="text-xl font-semibold">
          {{ fmtMoney(data!.totals.cpl) }}
        </p>
      </div>
      <div class="rounded-lg bg-elevated p-4">
        <p class="text-xs text-muted">
          Conversions
        </p>
        <p class="text-xl font-semibold">
          {{ fmtCompact(data!.totals.conversions) }}
        </p>
        <p v-if="deltaOf('conversions') !== null" :class="deltaClass('conversions')" class="text-xs mt-1">
          {{ fmtDelta(deltaOf('conversions')) }}
        </p>
      </div>
      <div class="rounded-lg bg-elevated p-4">
        <p class="text-xs text-muted">
          Blended ROAS
        </p>
        <p class="text-xl font-semibold">
          {{ fmtRoas(data!.totals.roas) }}
        </p>
      </div>
      <div class="rounded-lg bg-elevated p-4">
        <p class="text-xs text-muted">
          Sessions
        </p>
        <p class="text-xl font-semibold">
          {{ fmtCompact(data!.totals.sessions) }}
        </p>
        <p v-if="deltaOf('sessions') !== null" :class="deltaClass('sessions')" class="text-xs mt-1">
          {{ fmtDelta(deltaOf('sessions')) }}
        </p>
      </div>
    </div>

    <UTable :data="data!.channels" :columns="columns">
      <template #spend-cell="{ row }">
        {{ fmtCurrency(tableRow(row).spend) }}
      </template>
      <template #leads-cell="{ row }">
        {{ fmtCompact(tableRow(row).leads) }}
      </template>
      <template #cpl-cell="{ row }">
        {{ fmtMoney(tableRow(row).cpl) }}
      </template>
      <template #conversions-cell="{ row }">
        {{ fmtCompact(tableRow(row).conversions) }}
      </template>
      <template #cpa-cell="{ row }">
        {{ fmtMoney(tableRow(row).cpa) }}
      </template>
      <template #revenue-cell="{ row }">
        {{ fmtCurrency(tableRow(row).revenue) }}
      </template>
      <template #roas-cell="{ row }">
        {{ fmtRoas(tableRow(row).roas) }}
      </template>
      <template #sessions-cell="{ row }">
        {{ fmtCompact(tableRow(row).sessions) }}
      </template>
    </UTable>
  </UCard>
</template>
