<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { SiteIntelligenceGap } from '~/types/site-intelligence'

defineProps<{
  rows: SiteIntelligenceGap[]
  loading?: boolean
}>()

const columns: TableColumn<SiteIntelligenceGap>[] = [
  { accessorKey: 'title', header: 'Gap' },
  { accessorKey: 'type', header: 'Type' },
  { accessorKey: 'comparisonLevel', header: 'Comparison' },
  { accessorKey: 'confidence', header: 'Confidence' },
  { accessorKey: 'observedAt', header: 'Observed' },
  { id: 'evidence', header: 'Evidence' }
]

const dateFormatter = new Intl.DateTimeFormat('en-AU', {
  day: 'numeric',
  month: 'short',
  year: 'numeric'
})

function label(value: string): string {
  return value.replace(/_/g, ' ').replace(/^./, character => character.toUpperCase())
}
</script>

<template>
  <UCard>
    <div class="mb-4">
      <p class="text-xs font-medium uppercase tracking-[0.18em] text-muted">
        Paired evidence
      </p>
      <h2 class="mt-1 text-base font-semibold text-highlighted">
        Offer and content gaps
      </h2>
      <p class="mt-1 text-sm text-muted">
        Exact model matches outrank category suggestions. Low-evidence comparisons stay visibly unresolved.
      </p>
    </div>

    <UTable
      :data="rows"
      :columns="columns"
      :loading="loading"
      class="overflow-x-auto"
    >
      <template #title-cell="{ row }">
        <div class="max-w-md">
          <p class="font-medium text-highlighted">
            {{ row.original.title }}
          </p>
          <p class="mt-1 text-xs leading-5 text-muted">
            {{ row.original.explanation }}
          </p>
          <UBadge
            v-if="row.original.status === 'insufficient_data'"
            color="neutral"
            variant="soft"
            class="mt-2"
          >
            Building evidence
          </UBadge>
        </div>
      </template>
      <template #type-cell="{ row }">
        <UBadge color="neutral" variant="subtle">
          {{ label(row.original.type) }}
        </UBadge>
      </template>
      <template #comparisonLevel-cell="{ row }">
        <span class="text-sm text-muted">{{ label(row.original.comparisonLevel) }}</span>
      </template>
      <template #confidence-cell="{ row }">
        <span class="text-sm tabular-nums text-muted">{{ Math.round(row.original.confidence * 100) }}%</span>
      </template>
      <template #observedAt-cell="{ row }">
        <span class="whitespace-nowrap text-sm text-muted">{{ dateFormatter.format(new Date(row.original.observedAt)) }}</span>
      </template>
      <template #evidence-cell="{ row }">
        <div class="flex flex-col items-start gap-1">
          <a
            v-for="url in row.original.evidenceUrls"
            :key="url"
            :href="url"
            target="_blank"
            rel="noopener noreferrer"
            class="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            Source
            <UIcon name="i-lucide-external-link" class="size-3" />
          </a>
        </div>
      </template>
      <template #empty>
        <div class="py-8 text-center" role="status">
          <p class="text-sm font-medium text-highlighted">
            No supported gaps found
          </p>
          <p class="mt-1 text-sm text-muted">
            Current evidence does not support a conservative comparison yet.
          </p>
        </div>
      </template>
    </UTable>
  </UCard>
</template>
