<!-- app/components/analytics/FunnelChartData.client.vue -->
<!-- Mounts only when a client is selected (parent gates with v-if), so the
     fetch never fires for the "all clients" view. -->
<script setup lang="ts">
import { pctDelta, conversionRate, shareOfTotal, bestWorstCostPerLead } from '~/utils/funnelView'

const props = defineProps<{ clientId: string; startDate: string; endDate: string }>()
const { fmtCurrency, fmtCompact, fmtPercent } = useAnalytics()

interface FunnelRow {
  channel: string
  spend: number
  sessions: number
  engagedSessions: number
  keyEvents: number
  leads: number
  costPerSession: number | null
  costPerKeyEvent: number | null
  costPerLead: number | null
  sessionToLeadRate: number | null
}
interface FunnelResponse {
  channels: FunnelRow[]
  totals: FunnelRow
  hasGa4: boolean
  previous: { totals: FunnelRow }
}

const { data, pending, error } = await useFetch<FunnelResponse>('/api/agency/analytics/funnel', {
  query: {
    clientId: () => props.clientId,
    startDate: () => props.startDate,
    endDate: () => props.endDate
  },
  watch: [() => props.clientId, () => props.startDate, () => props.endDate]
})

function rateLabel(rate: number | null, suffix: string): string | null {
  return rate == null ? null : `${rate.toFixed(1)}% ${suffix}`
}

// Visual funnel stages, computed from current + previous totals.
const stages = computed(() => {
  const t = data.value?.totals
  const p = data.value?.previous?.totals
  if (!t) return []
  return [
    {
      key: 'spend',
      label: 'Ad spend',
      icon: 'i-lucide-wallet',
      display: fmtCurrency(t.spend),
      delta: pctDelta(t.spend, p?.spend),
      judge: 'neutral' as const,
      conversion: null as string | null,
      barShare: 1
    },
    {
      key: 'sessions',
      label: 'Sessions',
      icon: 'i-lucide-mouse-pointer-click',
      display: fmtCompact(t.sessions),
      delta: pctDelta(t.sessions, p?.sessions),
      judge: 'good' as const,
      conversion: t.costPerSession == null ? null : `${fmtCurrency(t.costPerSession, 2)} / session`,
      barShare: 1
    },
    {
      key: 'keyEvents',
      label: 'GA4 key events',
      icon: 'i-lucide-target',
      display: fmtCompact(t.keyEvents),
      delta: pctDelta(t.keyEvents, p?.keyEvents),
      judge: 'good' as const,
      conversion: rateLabel(conversionRate(t.keyEvents, t.sessions), 'of sessions'),
      barShare: shareOfTotal(t.keyEvents, t.sessions)
    },
    {
      key: 'leads',
      label: 'Leads',
      icon: 'i-lucide-inbox',
      display: fmtCompact(t.leads),
      delta: pctDelta(t.leads, p?.leads),
      judge: 'good' as const,
      conversion: rateLabel(conversionRate(t.leads, t.keyEvents), 'of key events'),
      barShare: shareOfTotal(t.leads, t.sessions)
    }
  ]
})

const bestWorst = computed(() => bestWorstCostPerLead(data.value?.channels || []))
const channels = computed(() => data.value?.channels ?? [])
const totalSessions = computed(() => data.value?.totals.sessions ?? 0)
const totalLeads = computed(() => data.value?.totals.leads ?? 0)

const columns = [
  { accessorKey: 'channel', header: 'Channel' },
  { accessorKey: 'spend', header: 'Spend' },
  { accessorKey: 'sessions', header: 'Sessions' },
  { accessorKey: 'engagedSessions', header: 'Engaged' },
  { accessorKey: 'keyEvents', header: 'Key events' },
  { accessorKey: 'leads', header: 'Leads' },
  { accessorKey: 'costPerSession', header: 'Cost / session' },
  { accessorKey: 'costPerKeyEvent', header: 'Cost / key event' },
  { accessorKey: 'costPerLead', header: 'Cost / lead' },
  { accessorKey: 'sessionToLeadRate', header: 'Session → lead' }
]

function fmtRatioCurrency(v: number | null): string {
  return v == null ? '—' : fmtCurrency(v, 2)
}
function fmtRatePct(v: number | null): string {
  return v == null ? '—' : fmtPercent(v * 100, 1)
}

// Delta color: green good / red bad for count stages; muted for spend or no change.
function deltaClass(delta: number | null, judge: 'good' | 'neutral'): string {
  if (delta == null || judge === 'neutral' || delta === 0) return 'text-muted'
  return delta > 0 ? 'text-green-500' : 'text-red-500'
}
function deltaIcon(delta: number | null): string {
  if ((delta ?? 0) === 0) return 'i-lucide-minus'
  return delta! > 0 ? 'i-lucide-trending-up' : 'i-lucide-trending-down'
}
</script>

<template>
  <UCard>
    <template #header>
      <div class="flex items-center gap-2">
        <UIcon name="i-lucide-filter" class="text-primary" />
        <span class="font-semibold">Website &amp; Funnel</span>
        <UTooltip text="GA4 key events are the on-site conversion signal; Leads are captured ground truth — they won't match exactly.">
          <UIcon name="i-lucide-info" class="text-muted" />
        </UTooltip>
      </div>
    </template>

    <!-- Loading -->
    <div v-if="pending" class="space-y-4">
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
        <USkeleton v-for="i in 4" :key="i" class="h-24 rounded-lg" />
      </div>
      <USkeleton class="h-48 w-full rounded-lg" />
    </div>

    <!-- Error -->
    <div v-else-if="error" class="text-sm text-error py-6 text-center">
      Couldn't load the funnel. Try refreshing.
    </div>

    <!-- No GA4 property mapped for this client -->
    <div v-else-if="!data?.hasGa4" class="flex flex-col items-center gap-3 py-10 text-center">
      <UIcon name="i-lucide-line-chart" class="w-8 h-8 text-muted" />
      <p class="text-sm text-muted">No GA4 property is mapped for this client yet.</p>
      <UButton
        to="/agency/social/ga4"
        icon="i-lucide-link"
        label="Map a property"
        size="sm"
        variant="outline"
        color="neutral"
      />
    </div>

    <!-- Populated -->
    <div v-else class="space-y-6">
      <!-- Visual funnel -->
      <div class="space-y-2">
        <div
          v-for="stage in stages"
          :key="stage.key"
          class="rounded-lg border border-default bg-elevated/30 p-3"
        >
          <div class="flex items-center gap-3">
            <UIcon :name="stage.icon" class="w-4 h-4 text-muted shrink-0" />
            <span class="text-xs text-muted font-medium w-28 shrink-0">{{ stage.label }}</span>
            <!-- proportional bar -->
            <div class="flex-1 h-2 rounded-full bg-default overflow-hidden">
              <div
                class="h-full rounded-full bg-primary"
                :style="{ width: `${Math.max(4, Math.round(stage.barShare * 100))}%` }"
              />
            </div>
            <span class="text-lg font-bold tabular-nums text-default w-24 text-right shrink-0">{{ stage.display }}</span>
            <span
              v-if="stage.delta !== null"
              class="flex items-center gap-0.5 w-20 justify-end shrink-0"
              :class="deltaClass(stage.delta, stage.judge)"
            >
              <UIcon :name="deltaIcon(stage.delta)" class="w-3.5 h-3.5" />
              <span class="text-xs font-medium tabular-nums">{{ Math.abs(stage.delta).toFixed(1) }}%</span>
            </span>
            <span v-else class="w-20 shrink-0" />
          </div>
          <!-- Conversion label aligns under the bar via spacers mirroring the icon (w-4) + label (w-28) + gaps. -->
          <div v-if="stage.conversion" class="flex mt-1">
            <div class="w-4 shrink-0" aria-hidden="true" />
            <div class="w-28 shrink-0 ml-3" aria-hidden="true" />
            <p class="text-xs text-muted ml-3">
              {{ stage.conversion }}
            </p>
          </div>
        </div>
      </div>

      <!-- Channel table -->
      <UTable :data="channels" :columns="columns">
        <template #spend-cell="{ row }">{{ fmtCurrency(row.original.spend) }}</template>
        <template #sessions-cell="{ row }">
          <div class="relative">
            <div class="absolute inset-y-0 left-0 rounded bg-primary/10" :style="{ width: `${Math.round(shareOfTotal(row.original.sessions, totalSessions) * 100)}%` }" />
            <span class="relative tabular-nums">{{ fmtCompact(row.original.sessions) }}</span>
          </div>
        </template>
        <template #engagedSessions-cell="{ row }">{{ fmtCompact(row.original.engagedSessions) }}</template>
        <template #keyEvents-cell="{ row }">{{ fmtCompact(row.original.keyEvents) }}</template>
        <template #leads-cell="{ row }">
          <div class="relative">
            <div class="absolute inset-y-0 left-0 rounded bg-success/10" :style="{ width: `${Math.round(shareOfTotal(row.original.leads, totalLeads) * 100)}%` }" />
            <span class="relative tabular-nums">{{ fmtCompact(row.original.leads) }}</span>
          </div>
        </template>
        <template #costPerSession-cell="{ row }">{{ fmtRatioCurrency(row.original.costPerSession) }}</template>
        <template #costPerKeyEvent-cell="{ row }">{{ fmtRatioCurrency(row.original.costPerKeyEvent) }}</template>
        <template #costPerLead-cell="{ row }">
          <span
            class="tabular-nums px-1.5 py-0.5 rounded"
            :class="{
              'bg-success/15 text-success font-medium': row.original.channel === bestWorst.best,
              'bg-warning/15 text-warning font-medium': row.original.channel === bestWorst.worst
            }"
          >{{ fmtRatioCurrency(row.original.costPerLead) }}</span>
        </template>
        <template #sessionToLeadRate-cell="{ row }">{{ fmtRatePct(row.original.sessionToLeadRate) }}</template>
      </UTable>
    </div>
  </UCard>
</template>
