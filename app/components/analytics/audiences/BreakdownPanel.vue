<script setup lang="ts">
import type { AudienceBreakdownRow } from '~/types/audience-analytics'
import { formatAudienceMetric } from '~/utils/audienceAnalytics'

defineProps<{
  title: string
  description: string
  rows: AudienceBreakdownRow[]
}>()

const columns = [
  { accessorKey: 'key', header: 'Segment' },
  { accessorKey: 'visitors', header: 'Visitors' },
  { accessorKey: 'engagementRate', header: 'Engagement' },
  { accessorKey: 'leadActions', header: 'Lead actions' },
  { accessorKey: 'confirmedLeads', header: 'Confirmed' },
  { accessorKey: 'confirmedLeadRate', header: 'Lead rate' }
]

const breakdownRow = (row: unknown): AudienceBreakdownRow => (
  ((row as { original?: AudienceBreakdownRow }).original ?? row) as AudienceBreakdownRow
)
</script>

<template>
  <UCard :ui="{ body: '!p-0' }">
    <template #header>
      <div>
        <h3 class="text-sm font-semibold text-highlighted">{{ title }}</h3>
        <p class="mt-1 text-xs text-muted">{{ description }}</p>
      </div>
    </template>

    <UTable v-if="rows.length" :data="rows" :columns="columns" class="min-w-[44rem]">
      <template #key-cell="{ row }">
        <span class="block max-w-56 truncate font-medium text-highlighted" :title="breakdownRow(row).key">
          {{ breakdownRow(row).key || 'Unclassified' }}
        </span>
      </template>
      <template #visitors-cell="{ row }">
        <span class="tabular-nums">{{ formatAudienceMetric('visitors', breakdownRow(row).visitors) }}</span>
      </template>
      <template #engagementRate-cell="{ row }">
        <span class="tabular-nums">{{ formatAudienceMetric('engagementRate', breakdownRow(row).engagementRate) }}</span>
      </template>
      <template #leadActions-cell="{ row }">
        <span class="tabular-nums">{{ formatAudienceMetric('leadActions', breakdownRow(row).leadActions) }}</span>
      </template>
      <template #confirmedLeads-cell="{ row }">
        <span class="tabular-nums font-medium text-highlighted">{{ formatAudienceMetric('confirmedLeads', breakdownRow(row).confirmedLeads) }}</span>
      </template>
      <template #confirmedLeadRate-cell="{ row }">
        <span class="tabular-nums">{{ formatAudienceMetric('confirmedLeadRate', breakdownRow(row).confirmedLeadRate) }}</span>
      </template>
    </UTable>

    <div v-else class="px-5 py-10 text-center">
      <UIcon name="i-lucide-list-filter" class="mx-auto size-6 text-muted" />
      <p class="mt-2 text-sm font-medium">No ranked segments in this window</p>
      <p class="mt-1 text-xs text-muted">This panel will populate as classified traffic and lead outcomes arrive.</p>
    </div>
  </UCard>
</template>
