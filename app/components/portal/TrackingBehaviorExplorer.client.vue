<script setup lang="ts">
type BehaviorDimension = 'pages' | 'devices' | 'sources'

type BehaviorRow = {
  key: string
  visitors: number
  sessions: number
  pageViews: number
  events: number
  engagedSessions: number
  engagementRate: number
  avgEngagementSeconds: number
  scroll75Sessions: number
  vehicleViews: number
  phoneClicks: number
  formSubmits: number
  leadIntents: number
  confirmedLeads: number
  qualifiedLeads: number
  wonLeads: number
  confirmedLeadRate: number
}

type BehaviorInsights = {
  generatedAt: string
  authority: {
    behavior: string
    leadIntent: string
    confirmedOutcome: string
    externalLiveCalls: boolean
  }
  dimensions: Record<BehaviorDimension, BehaviorRow[]>
}

const props = defineProps<{
  data: BehaviorInsights | null
  pending: boolean
}>()

const selectedDimension = ref<BehaviorDimension>('pages')
const selectedKey = ref<string | null>(null)

const dimensionOptions: Array<{
  key: BehaviorDimension
  label: string
  icon: string
}> = [
  { key: 'pages', label: 'Pages', icon: 'i-lucide-files' },
  { key: 'devices', label: 'Devices', icon: 'i-lucide-monitor-smartphone' },
  { key: 'sources', label: 'Sources', icon: 'i-lucide-waypoints' }
]

const rows = computed(() => props.data?.dimensions[selectedDimension.value] ?? [])
const selectedRow = computed(() => {
  const match = rows.value.find(row => row.key === selectedKey.value)
  return match ?? rows.value[0] ?? null
})

watch([selectedDimension, rows], () => {
  if (!rows.value.some(row => row.key === selectedKey.value)) {
    selectedKey.value = rows.value[0]?.key ?? null
  }
}, { immediate: true })

const strongestAction = computed(() => {
  const row = selectedRow.value
  if (!row) return null
  const actions = [
    { label: 'vehicle views', value: row.vehicleViews },
    { label: 'phone clicks', value: row.phoneClicks },
    { label: 'form submissions', value: row.formSubmits }
  ].sort((a, b) => b.value - a.value)
  return actions[0]?.value ? actions[0] : null
})

function compact(value: number) {
  return new Intl.NumberFormat('en-AU', { notation: 'compact', maximumFractionDigits: 1 }).format(value)
}
</script>

<template>
  <UCard :ui="{ body: 'p-0 sm:p-0' }">
    <div class="flex flex-col gap-4 border-b border-default p-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-scan-search" class="size-4 text-primary" />
          <h3 class="text-sm font-semibold text-default">
            Behaviour explorer
          </h3>
        </div>
        <p class="mt-1 text-xs text-muted">
          First-party journeys connected to confirmed lead and CRM outcomes.
        </p>
      </div>
      <div class="flex flex-wrap gap-1 rounded-lg bg-elevated/60 p-1">
        <UButton
          v-for="option in dimensionOptions"
          :key="option.key"
          :icon="option.icon"
          :label="option.label"
          size="xs"
          color="neutral"
          :variant="selectedDimension === option.key ? 'solid' : 'ghost'"
          @click="selectedDimension = option.key"
        />
      </div>
    </div>

    <div v-if="pending" class="grid gap-4 p-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(280px,0.8fr)]">
      <USkeleton class="h-80 rounded-lg" />
      <USkeleton class="h-80 rounded-lg" />
    </div>

    <div
      v-else-if="rows.length"
      class="grid lg:grid-cols-[minmax(0,1.5fr)_minmax(300px,0.8fr)]"
    >
      <div class="min-w-0 overflow-x-auto border-b border-default lg:border-b-0 lg:border-r">
        <table class="w-full min-w-[760px] text-left text-xs">
          <thead class="bg-elevated/35 text-muted">
            <tr>
              <th class="px-4 py-3 font-medium">{{ dimensionOptions.find(item => item.key === selectedDimension)?.label }}</th>
              <th class="px-3 py-3 text-right font-medium">Sessions</th>
              <th class="px-3 py-3 text-right font-medium">Engaged</th>
              <th class="px-3 py-3 text-right font-medium">Vehicle views</th>
              <th class="px-3 py-3 text-right font-medium">Submits</th>
              <th class="px-3 py-3 text-right font-medium">Confirmed</th>
              <th class="px-4 py-3 text-right font-medium">Lead rate</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-default">
            <tr
              v-for="row in rows"
              :key="row.key"
              class="cursor-pointer transition-colors hover:bg-elevated/45"
              :class="selectedRow?.key === row.key ? 'bg-primary/5' : ''"
              @click="selectedKey = row.key"
            >
              <td class="max-w-[340px] px-4 py-3">
                <div class="flex items-center gap-2">
                  <span
                    class="size-1.5 shrink-0 rounded-full"
                    :class="selectedRow?.key === row.key ? 'bg-primary' : 'bg-muted'"
                  />
                  <span class="truncate font-medium text-default" :title="row.key">{{ row.key }}</span>
                </div>
              </td>
              <td class="px-3 py-3 text-right tabular-nums text-muted">{{ compact(row.sessions) }}</td>
              <td class="px-3 py-3 text-right tabular-nums text-muted">{{ row.engagementRate }}%</td>
              <td class="px-3 py-3 text-right tabular-nums text-muted">{{ compact(row.vehicleViews) }}</td>
              <td class="px-3 py-3 text-right tabular-nums text-muted">{{ compact(row.formSubmits) }}</td>
              <td class="px-3 py-3 text-right tabular-nums font-medium text-default">{{ compact(row.confirmedLeads) }}</td>
              <td class="px-4 py-3 text-right tabular-nums">
                <UBadge
                  :color="row.confirmedLeadRate > 0 ? 'success' : 'neutral'"
                  variant="subtle"
                  size="sm"
                >
                  {{ row.confirmedLeadRate }}%
                </UBadge>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <aside v-if="selectedRow" class="space-y-4 p-4">
        <div>
          <p class="text-[11px] font-medium uppercase tracking-wide text-muted">
            Selected {{ selectedDimension.slice(0, -1) }}
          </p>
          <p class="mt-1 break-words text-sm font-semibold text-default">
            {{ selectedRow.key }}
          </p>
        </div>

        <div class="grid grid-cols-2 gap-2">
          <div class="rounded-lg bg-elevated/55 p-3">
            <p class="text-[11px] text-muted">Visitors</p>
            <p class="mt-1 text-lg font-semibold tabular-nums">{{ compact(selectedRow.visitors) }}</p>
          </div>
          <div class="rounded-lg bg-elevated/55 p-3">
            <p class="text-[11px] text-muted">Avg. engagement</p>
            <p class="mt-1 text-lg font-semibold tabular-nums">{{ selectedRow.avgEngagementSeconds }}s</p>
          </div>
          <div class="rounded-lg bg-elevated/55 p-3">
            <p class="text-[11px] text-muted">Scrolled 75%</p>
            <p class="mt-1 text-lg font-semibold tabular-nums">{{ compact(selectedRow.scroll75Sessions) }}</p>
          </div>
          <div class="rounded-lg bg-elevated/55 p-3">
            <p class="text-[11px] text-muted">Phone clicks</p>
            <p class="mt-1 text-lg font-semibold tabular-nums">{{ compact(selectedRow.phoneClicks) }}</p>
          </div>
        </div>

        <div class="rounded-lg border border-default p-3">
          <p class="text-xs font-medium text-default">Outcome progression</p>
          <div class="mt-3 space-y-2 text-xs">
            <div class="flex items-center justify-between">
              <span class="text-muted">Lead intents</span>
              <span class="font-medium tabular-nums">{{ selectedRow.leadIntents }}</span>
            </div>
            <div class="flex items-center justify-between">
              <span class="text-muted">Confirmed leads</span>
              <span class="font-medium tabular-nums">{{ selectedRow.confirmedLeads }}</span>
            </div>
            <div class="flex items-center justify-between">
              <span class="text-muted">Qualified</span>
              <span class="font-medium tabular-nums">{{ selectedRow.qualifiedLeads }}</span>
            </div>
            <div class="flex items-center justify-between">
              <span class="text-muted">Won</span>
              <span class="font-medium tabular-nums">{{ selectedRow.wonLeads }}</span>
            </div>
          </div>
        </div>

        <div class="rounded-lg bg-primary/5 p-3 text-xs">
          <div class="flex items-start gap-2">
            <UIcon name="i-lucide-sparkles" class="mt-0.5 size-4 shrink-0 text-primary" />
            <p class="text-muted">
              <template v-if="strongestAction">
                The strongest observed intent is <span class="font-medium text-default">{{ strongestAction.label }}</span>
                with {{ strongestAction.value }} interaction(s).
              </template>
              <template v-else>
                No strong intent action has been observed for this selection.
              </template>
            </p>
          </div>
        </div>

        <p class="text-[11px] leading-relaxed text-dimmed">
          Confirmed outcomes use the browser submission bridge. Provider-native leads without a website journey are intentionally excluded from this breakdown.
        </p>
      </aside>
    </div>

    <div v-else class="p-8 text-center">
      <UIcon name="i-lucide-chart-no-axes-combined" class="mx-auto size-7 text-dimmed" />
      <p class="mt-2 text-sm font-medium text-default">No behavioural data</p>
      <p class="mt-1 text-xs text-muted">No events were recorded for this date range.</p>
    </div>
  </UCard>
</template>
