<!-- app/components/portal/FunnelChart.client.vue -->
<script setup lang="ts">
// `clientId` is only needed for the agency endpoint; the portal endpoint scopes
// to the authenticated client itself.
const props = defineProps<{ startDate: string; endDate: string; apiBase?: string; clientId?: string | null }>()
const { fmtCurrency, fmtCompact } = useAnalytics()
const endpoint = computed(() => props.apiBase ?? '/api/portal/analytics/funnel')

interface FunnelRow {
  channel: string; spend: number; sessions: number; engagedSessions: number
  keyEvents: number; leads: number
  totalUsers: number; newUsers: number
  engagementRate: number | null; avgSessionDuration: number | null
  costPerSession: number | null; costPerKeyEvent: number | null
  costPerLead: number | null; sessionToLeadRate: number | null
}
type ComparedMetric = 'spend' | 'sessions' | 'totalUsers' | 'keyEvents' | 'leads'
interface FunnelComparison { totals: FunnelRow; deltaPct: Record<ComparedMetric, number | null> }
interface FunnelResponse { channels: FunnelRow[]; totals: FunnelRow; comparison?: FunnelComparison; hasGa4: boolean }

const apiFetch = $fetch as <T = unknown>(
  request: string,
  options?: { query?: Record<string, unknown> }
) => Promise<T>
const data = ref<FunnelResponse | null>(null)
const pending = ref(false)

async function refresh() {
  pending.value = true
  try {
    data.value = await apiFetch<FunnelResponse>(endpoint.value, {
      query: {
        startDate: props.startDate,
        endDate: props.endDate,
        clientId: props.clientId ?? undefined
      }
    })
  } catch {
    data.value = null
  } finally {
    pending.value = false
  }
}

await refresh()
watch([() => props.startDate, () => props.endDate, () => props.clientId, endpoint], () => {
  void refresh()
})

const columns = [
  { accessorKey: 'channel', header: 'Channel' },
  { accessorKey: 'spend', header: 'Spend' },
  { accessorKey: 'sessions', header: 'Sessions' },
  { accessorKey: 'totalUsers', header: 'Users' },
  { accessorKey: 'engagementRate', header: 'Engagement' },
  { accessorKey: 'keyEvents', header: 'GA4 key events' },
  { accessorKey: 'leads', header: 'Leads' },
  { accessorKey: 'costPerLead', header: 'Cost / lead' }
]

function tableRow(row: unknown): FunnelRow {
  return ((row as { original?: FunnelRow }).original ?? row) as FunnelRow
}

function fmtRatio(v: number | null): string {
  return v === null ? '—' : fmtCurrency(v)
}
function fmtPct(v: number | null): string {
  return v === null ? '—' : `${(v * 100).toFixed(1)}%`
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
  <UCard v-if="!pending && data?.hasGa4">
    <template #header>
      <div class="flex items-center gap-2">
        <UIcon name="i-lucide-filter" class="text-primary" />
        <span class="font-semibold">Website &amp; Funnel</span>
        <UTooltip text="GA4 key events are the on-site conversion signal; Leads are captured ground truth. They won't match exactly.">
          <UIcon name="i-lucide-info" class="text-muted" />
        </UTooltip>
      </div>
    </template>

    <!-- Top-line funnel stages -->
    <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
      <div class="rounded-lg bg-elevated p-4">
        <p class="text-xs text-muted">Ad spend</p>
        <p class="text-xl font-semibold">{{ fmtCurrency(data!.totals.spend) }}</p>
        <p v-if="deltaOf('spend') !== null" :class="deltaClass('spend')" class="text-xs mt-1">{{ fmtDelta(deltaOf('spend')) }}</p>
      </div>
      <div class="rounded-lg bg-elevated p-4">
        <p class="text-xs text-muted">Sessions</p>
        <p class="text-xl font-semibold">{{ fmtCompact(data!.totals.sessions) }}</p>
        <p v-if="deltaOf('sessions') !== null" :class="deltaClass('sessions')" class="text-xs mt-1">{{ fmtDelta(deltaOf('sessions')) }}</p>
      </div>
      <div class="rounded-lg bg-elevated p-4">
        <p class="text-xs text-muted">Users</p>
        <p class="text-xl font-semibold">{{ fmtCompact(data!.totals.totalUsers) }}</p>
        <p v-if="deltaOf('totalUsers') !== null" :class="deltaClass('totalUsers')" class="text-xs mt-1">{{ fmtDelta(deltaOf('totalUsers')) }}</p>
      </div>
      <div class="rounded-lg bg-elevated p-4">
        <p class="text-xs text-muted">Engagement rate</p>
        <p class="text-xl font-semibold">{{ fmtPct(data!.totals.engagementRate) }}</p>
      </div>
      <div class="rounded-lg bg-elevated p-4">
        <p class="text-xs text-muted">GA4 key events</p>
        <p class="text-xl font-semibold">{{ fmtCompact(data!.totals.keyEvents) }}</p>
        <p v-if="deltaOf('keyEvents') !== null" :class="deltaClass('keyEvents')" class="text-xs mt-1">{{ fmtDelta(deltaOf('keyEvents')) }}</p>
      </div>
      <div class="rounded-lg bg-elevated p-4">
        <p class="text-xs text-muted">Leads</p>
        <p class="text-xl font-semibold">{{ fmtCompact(data!.totals.leads) }}</p>
        <p v-if="deltaOf('leads') !== null" :class="deltaClass('leads')" class="text-xs mt-1">{{ fmtDelta(deltaOf('leads')) }}</p>
      </div>
    </div>

    <UTable :data="data!.channels" :columns="columns">
      <template #spend-cell="{ row }">{{ fmtCurrency(tableRow(row).spend) }}</template>
      <template #sessions-cell="{ row }">{{ fmtCompact(tableRow(row).sessions) }}</template>
      <template #totalUsers-cell="{ row }">{{ fmtCompact(tableRow(row).totalUsers) }}</template>
      <template #engagementRate-cell="{ row }">{{ fmtPct(tableRow(row).engagementRate) }}</template>
      <template #keyEvents-cell="{ row }">{{ fmtCompact(tableRow(row).keyEvents) }}</template>
      <template #leads-cell="{ row }">{{ fmtCompact(tableRow(row).leads) }}</template>
      <template #costPerLead-cell="{ row }">{{ fmtRatio(tableRow(row).costPerLead) }}</template>
    </UTable>
  </UCard>
</template>
