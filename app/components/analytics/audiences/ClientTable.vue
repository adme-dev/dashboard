<script setup lang="ts">
import type { AudienceClientRow } from '~/types/audience-analytics'
import { formatAudienceMetric, formatFreshness, siteStatusMeta } from '~/utils/audienceAnalytics'

const props = defineProps<{
  clients: AudienceClientRow[]
}>()

type SortKey
  = | 'status'
    | 'visitors'
    | 'engagementRate'
    | 'leadActions'
    | 'confirmedLeads'
    | 'visitorToLeadRate'
    | 'attributionCoverage'
    | 'visitorsDeltaPercent'
    | 'lastEventAt'

const sortKey = ref<SortKey>('status')
const descending = ref(false)
const sortOptions: Array<{ label: string, value: SortKey }> = [
  { label: 'Tracking health', value: 'status' },
  { label: 'Visitors', value: 'visitors' },
  { label: 'Engagement rate', value: 'engagementRate' },
  { label: 'Lead actions', value: 'leadActions' },
  { label: 'Confirmed leads', value: 'confirmedLeads' },
  { label: 'Conversion rate', value: 'visitorToLeadRate' },
  { label: 'Attribution coverage', value: 'attributionCoverage' },
  { label: 'Visitor change', value: 'visitorsDeltaPercent' },
  { label: 'Freshness', value: 'lastEventAt' }
]

const healthRank: Record<AudienceClientRow['status'], number> = {
  receiving: 0,
  stale: 1,
  no_recent_data: 2,
  never_received: 3,
  inactive: 4
}

const columns = [
  { accessorKey: 'clientName', header: 'Client' },
  { accessorKey: 'status', header: 'Health' },
  { accessorKey: 'visitors', header: 'Visitors' },
  { accessorKey: 'engagementRate', header: 'Engagement' },
  { accessorKey: 'leadActions', header: 'Lead actions' },
  { accessorKey: 'confirmedLeads', header: 'Confirmed' },
  { accessorKey: 'visitorToLeadRate', header: 'Lead rate' },
  { accessorKey: 'attributionCoverage', header: 'Attribution' },
  { accessorKey: 'visitorsDeltaPercent', header: 'Change' },
  { accessorKey: 'lastEventAt', header: 'Freshness' }
]

const sortedClients = computed(() => [...props.clients].sort((left, right) => {
  let leftValue: number
  let rightValue: number
  if (sortKey.value === 'status') {
    leftValue = healthRank[left.status]
    rightValue = healthRank[right.status]
  } else if (sortKey.value === 'lastEventAt') {
    leftValue = left.lastEventAt ? new Date(left.lastEventAt).getTime() : 0
    rightValue = right.lastEventAt ? new Date(right.lastEventAt).getTime() : 0
  } else {
    leftValue = Number(left[sortKey.value] ?? Number.NEGATIVE_INFINITY)
    rightValue = Number(right[sortKey.value] ?? Number.NEGATIVE_INFINITY)
  }

  const result = leftValue === rightValue
    ? left.clientName.localeCompare(right.clientName)
    : leftValue - rightValue
  return descending.value ? -result : result
}))

const clientRow = (row: unknown): AudienceClientRow => (
  ((row as { original?: AudienceClientRow }).original ?? row) as AudienceClientRow
)

function deltaLabel(value: number | null): string {
  if (value === null) return '—'
  if (value === 0) return 'No change'
  return `${value > 0 ? '+' : ''}${value.toLocaleString('en-AU', { maximumFractionDigits: 1 })}%`
}
</script>

<template>
  <UCard :ui="{ body: '!p-0' }">
    <template #header>
      <div class="@container flex flex-col gap-4 @lg:flex-row @lg:items-end @lg:justify-between">
        <div>
          <p class="text-xs font-medium uppercase tracking-[0.18em] text-muted">
            Cross-client view
          </p>
          <h2 class="mt-1 text-base font-semibold text-highlighted">
            Client comparison
          </h2>
          <p class="mt-1 text-xs text-muted">
            Rank aggregate audience quality and tracking readiness across accessible clients.
          </p>
        </div>
        <div class="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2 @lg:w-80">
          <UFormField label="Sort by">
            <USelectMenu
              v-model="sortKey"
              :items="sortOptions"
              value-key="value"
              class="w-full"
            />
          </UFormField>
          <UButton
            :label="descending ? 'Descending' : 'Ascending'"
            :icon="descending ? 'i-lucide-arrow-down-wide-narrow' : 'i-lucide-arrow-up-narrow-wide'"
            color="neutral"
            variant="outline"
            @click="descending = !descending"
          />
        </div>
      </div>
    </template>

    <UTable
      v-if="sortedClients.length"
      :data="sortedClients"
      :columns="columns"
      class="min-w-[68rem]"
    >
      <template #clientName-cell="{ row }">
        <ULink :to="`/agency/tracking/${clientRow(row).clientId}`" class="font-medium text-highlighted hover:text-primary">
          {{ clientRow(row).clientName }}
        </ULink>
        <p class="text-xs text-muted">
          {{ clientRow(row).siteCount }} endpoint{{ clientRow(row).siteCount === 1 ? '' : 's' }}
        </p>
      </template>
      <template #status-cell="{ row }">
        <UBadge :color="siteStatusMeta(clientRow(row).status).color" variant="soft" size="sm">
          {{ siteStatusMeta(clientRow(row).status).label }}
        </UBadge>
      </template>
      <template #visitors-cell="{ row }">
        <span class="tabular-nums">{{ formatAudienceMetric('visitors', clientRow(row).visitors) }}</span>
      </template>
      <template #engagementRate-cell="{ row }">
        <span class="tabular-nums">{{ formatAudienceMetric('engagementRate', clientRow(row).engagementRate) }}</span>
      </template>
      <template #leadActions-cell="{ row }">
        <span class="tabular-nums">{{ formatAudienceMetric('leadActions', clientRow(row).leadActions) }}</span>
      </template>
      <template #confirmedLeads-cell="{ row }">
        <span class="tabular-nums font-medium text-highlighted">{{ formatAudienceMetric('confirmedLeads', clientRow(row).confirmedLeads) }}</span>
      </template>
      <template #visitorToLeadRate-cell="{ row }">
        <span class="tabular-nums">{{ formatAudienceMetric('visitorToLeadRate', clientRow(row).visitorToLeadRate) }}</span>
      </template>
      <template #attributionCoverage-cell="{ row }">
        <span class="tabular-nums">{{ formatAudienceMetric('attributionCoverage', clientRow(row).attributionCoverage) }}</span>
      </template>
      <template #visitorsDeltaPercent-cell="{ row }">
        <span class="tabular-nums">{{ deltaLabel(clientRow(row).visitorsDeltaPercent) }}</span>
      </template>
      <template #lastEventAt-cell="{ row }">
        <span class="whitespace-nowrap text-xs text-muted">{{ formatFreshness(clientRow(row).lastEventAt) }}</span>
      </template>
    </UTable>

    <div v-else class="px-5 py-10 text-center">
      <UIcon name="i-lucide-building-2" class="mx-auto size-6 text-muted" />
      <p class="mt-2 text-sm font-medium">
        No clients have audience data in this scope
      </p>
      <p class="mt-1 text-xs text-muted">
        Tracking diagnostics remain available from the endpoint ledger.
      </p>
    </div>
  </UCard>
</template>
