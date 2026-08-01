<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { SiteIntelligenceDomain } from '~/types/site-intelligence'

defineProps<{
  domains: SiteIntelligenceDomain[]
  loading?: boolean
  canManage?: boolean
}>()

const emit = defineEmits<{
  add: []
  edit: [domain: SiteIntelligenceDomain]
}>()

const columns: TableColumn<SiteIntelligenceDomain>[] = [
  { accessorKey: 'name', header: 'Domain' },
  { accessorKey: 'clientName', header: 'Client' },
  { accessorKey: 'lane', header: 'Lane' },
  { accessorKey: 'status', header: 'Status' },
  { accessorKey: 'frequency', header: 'Frequency' },
  { accessorKey: 'lastRunAt', header: 'Last run' },
  { id: 'actions', header: '' }
]

const dateFormatter = new Intl.DateTimeFormat('en-AU', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit'
})

function displayDate(value: string | null): string {
  return value ? dateFormatter.format(new Date(value)) : 'Never run'
}
</script>

<template>
  <UCard>
    <div class="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h2 class="font-semibold text-highlighted">
          Monitored domains
        </h2>
        <p class="mt-1 text-sm text-muted">
          Approved client-owned and public competitor collection boundaries.
        </p>
      </div>
      <UButton
        v-if="canManage"
        label="Add domain"
        icon="i-lucide-plus"
        size="sm"
        @click="emit('add')"
      />
    </div>

    <UTable :data="domains" :columns="columns" :loading="loading">
      <template #name-cell="{ row }">
        <div class="min-w-0">
          <p class="truncate font-medium text-highlighted">
            {{ row.original.name }}
          </p>
          <a
            :href="row.original.origin"
            target="_blank"
            rel="noopener noreferrer"
            class="block truncate text-xs text-primary hover:underline"
          >
            {{ row.original.origin }}
          </a>
        </div>
      </template>
      <template #lane-cell="{ row }">
        <UBadge :color="row.original.lane === 'owned' ? 'primary' : 'warning'" variant="subtle">
          {{ row.original.lane === 'owned' ? 'Owned' : 'Competitor' }}
        </UBadge>
      </template>
      <template #status-cell="{ row }">
        <UBadge :color="row.original.status === 'active' ? 'success' : 'neutral'" variant="subtle">
          {{ row.original.status === 'active' ? 'Active' : 'Paused' }}
        </UBadge>
      </template>
      <template #lastRunAt-cell="{ row }">
        <span class="text-sm text-muted">{{ displayDate(row.original.lastRunAt) }}</span>
      </template>
      <template #actions-cell="{ row }">
        <UButton
          v-if="canManage"
          label="Edit"
          icon="i-lucide-settings-2"
          color="neutral"
          variant="ghost"
          size="xs"
          @click="emit('edit', row.original)"
        />
      </template>
      <template #empty>
        <div class="py-10 text-center">
          <UIcon name="i-lucide-globe-lock" class="mx-auto size-8 text-muted" />
          <p class="mt-3 font-medium text-highlighted">
            No monitored domains
          </p>
          <p class="mt-1 text-sm text-muted">
            Add an approved domain to establish the first collection boundary.
          </p>
        </div>
      </template>
    </UTable>
  </UCard>
</template>
