<!-- app/components/portal/FunnelChart.client.vue -->
<script setup lang="ts">
const props = defineProps<{ startDate: string; endDate: string }>()
const { fmtCurrency, fmtCompact } = useAnalytics()

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

const { data, pending } = await useFetch<FunnelResponse>('/api/portal/analytics/funnel', {
  query: { startDate: () => props.startDate, endDate: () => props.endDate },
  watch: [() => props.startDate, () => props.endDate]
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
      <template #spend-cell="{ row }">{{ fmtCurrency(row.original.spend) }}</template>
      <template #sessions-cell="{ row }">{{ fmtCompact(row.original.sessions) }}</template>
      <template #totalUsers-cell="{ row }">{{ fmtCompact(row.original.totalUsers) }}</template>
      <template #engagementRate-cell="{ row }">{{ fmtPct(row.original.engagementRate) }}</template>
      <template #keyEvents-cell="{ row }">{{ fmtCompact(row.original.keyEvents) }}</template>
      <template #leads-cell="{ row }">{{ fmtCompact(row.original.leads) }}</template>
      <template #costPerLead-cell="{ row }">{{ fmtRatio(row.original.costPerLead) }}</template>
    </UTable>
  </UCard>
</template>
