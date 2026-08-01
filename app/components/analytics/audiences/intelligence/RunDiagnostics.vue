<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { SiteIntelligenceDomain, SiteIntelligenceRun } from '~/types/site-intelligence'

const props = defineProps<{
  runs: SiteIntelligenceRun[]
  domains: SiteIntelligenceDomain[]
  loading?: boolean
  canManage?: boolean
}>()

const emit = defineEmits<{
  inspect: [run: SiteIntelligenceRun]
  crawl: [domain: SiteIntelligenceDomain]
}>()

const columns: TableColumn<SiteIntelligenceRun>[] = [
  { accessorKey: 'domainId', header: 'Domain' },
  { accessorKey: 'status', header: 'Latest state' },
  { accessorKey: 'completedPages', header: 'Pages' },
  { accessorKey: 'changedPages', header: 'Changed' },
  { accessorKey: 'completedAt', header: 'Completed' },
  { id: 'actions', header: '' }
]

const dateFormatter = new Intl.DateTimeFormat('en-AU', {
  day: 'numeric',
  month: 'short',
  hour: 'numeric',
  minute: '2-digit'
})

function domainFor(run: SiteIntelligenceRun) {
  return props.domains.find(domain => domain.id === run.domainId)
}

function stateCopy(run: SiteIntelligenceRun): string {
  if (run.status === 'blocked') return 'Access controls or declared policy prevented collection.'
  if (run.status === 'partial') return 'Some approved pages were collected; review excluded and errored counts.'
  if (run.status === 'failed') return run.errorSummary || 'Collection failed before a usable result was produced.'
  return run.status.replace(/_/g, ' ')
}

function stateColor(status: SiteIntelligenceRun['status']) {
  if (status === 'completed') return 'success' as const
  if (status === 'partial' || status === 'blocked') return 'warning' as const
  if (status === 'failed') return 'error' as const
  return 'neutral' as const
}
</script>

<template>
  <UCard>
    <div class="mb-4">
      <p class="text-xs font-medium uppercase tracking-[0.18em] text-muted">
        Operations
      </p>
      <h2 class="mt-1 text-base font-semibold text-highlighted">
        Run diagnostics
      </h2>
      <p class="mt-1 text-sm text-muted">
        Collection states distinguish policy blocks, partial results, failures, and healthy completion.
      </p>
    </div>

    <UTable
      :data="runs"
      :columns="columns"
      :loading="loading"
      class="overflow-x-auto"
    >
      <template #domainId-cell="{ row }">
        <div>
          <p class="font-medium text-highlighted">
            {{ domainFor(row.original)?.name || 'Unknown domain' }}
          </p>
          <p class="text-xs text-muted">
            {{ domainFor(row.original)?.lane === 'competitor' ? 'Public competitor' : 'Client-owned' }}
          </p>
        </div>
      </template>
      <template #status-cell="{ row }">
        <UTooltip :text="stateCopy(row.original)">
          <UBadge :color="stateColor(row.original.status)" variant="subtle">
            {{ row.original.status }}
          </UBadge>
        </UTooltip>
      </template>
      <template #completedPages-cell="{ row }">
        <span class="text-sm tabular-nums text-muted">{{ row.original.completedPages }} / {{ row.original.totalPages }}</span>
      </template>
      <template #changedPages-cell="{ row }">
        <span class="text-sm tabular-nums text-muted">{{ row.original.changedPages }}</span>
      </template>
      <template #completedAt-cell="{ row }">
        <span class="whitespace-nowrap text-sm text-muted">
          {{ row.original.completedAt ? dateFormatter.format(new Date(row.original.completedAt)) : 'In progress' }}
        </span>
      </template>
      <template #actions-cell="{ row }">
        <div class="flex justify-end gap-1">
          <UButton
            label="Inspect"
            color="neutral"
            variant="ghost"
            size="xs"
            @click="emit('inspect', row.original)"
          />
          <UButton
            v-if="canManage && domainFor(row.original)"
            label="Crawl"
            color="neutral"
            variant="ghost"
            size="xs"
            @click="emit('crawl', domainFor(row.original)!)"
          />
        </div>
      </template>
      <template #empty>
        <div class="py-8 text-center" role="status">
          <p class="text-sm font-medium text-highlighted">
            Collection has not started
          </p>
          <p class="mt-1 text-sm text-muted">
            Run an approved domain to begin building current evidence.
          </p>
        </div>
      </template>
    </UTable>
  </UCard>
</template>
