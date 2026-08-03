<script setup lang="ts">
import type { SearchAuthorityTrustFinding } from '~/types'

defineProps<{ findings: SearchAuthorityTrustFinding[], loading?: boolean }>()
const emit = defineEmits<{ createTask: [finding: SearchAuthorityTrustFinding] }>()

const columns = [
  { accessorKey: 'finding', header: 'Finding' },
  { accessorKey: 'owner', header: 'Owner' },
  { accessorKey: 'recurrence', header: 'Seen' },
  { accessorKey: 'action', header: '' }
]

function severityColor(severity: SearchAuthorityTrustFinding['severity']) {
  if (severity === 'critical' || severity === 'high') return 'error'
  if (severity === 'medium') return 'warning'
  if (severity === 'low') return 'info'
  return 'neutral'
}

function ownerLabel(owner: SearchAuthorityTrustFinding['owner']): string {
  if (owner === 'dealer_origin') return 'Dealer website'
  if (owner === 'external_provider') return 'Provider'
  return 'XeroFlow'
}
</script>

<template>
  <UCard>
    <template #header>
      <div>
        <h2 class="font-semibold text-highlighted">
          Technical trust findings
        </h2>
        <p class="mt-1 text-sm text-muted">
          Deterministic issues from the latest governed owned-site observations.
        </p>
      </div>
    </template>

    <UTable :data="findings" :columns="columns" :loading="loading">
      <template #finding-cell="{ row }">
        <div class="max-w-xl space-y-1 py-1">
          <div class="flex flex-wrap items-center gap-2">
            <UBadge :label="row.original.severity" :color="severityColor(row.original.severity)" variant="subtle" />
            <span class="font-medium text-highlighted">{{ row.original.title }}</span>
          </div>
          <p class="text-sm text-muted">
            {{ row.original.summary }}
          </p>
          <a
            :href="row.original.pageUrl"
            target="_blank"
            rel="noopener noreferrer"
            class="block truncate text-xs text-primary hover:underline"
          >
            {{ row.original.pageUrl }}
          </a>
        </div>
      </template>
      <template #owner-cell="{ row }">
        <span class="text-sm text-muted">{{ ownerLabel(row.original.owner) }}</span>
      </template>
      <template #recurrence-cell="{ row }">
        <div class="text-sm">
          <div class="font-medium text-highlighted">
            {{ row.original.recurrenceCount }}×
          </div>
          <div class="text-xs text-muted">
            {{ new Date(row.original.lastSeenAt).toLocaleDateString('en-AU') }}
          </div>
        </div>
      </template>
      <template #action-cell="{ row }">
        <UBadge
          v-if="row.original.taskId"
          label="Task linked"
          color="success"
          variant="subtle"
        />
        <UButton
          v-else-if="row.original.lifecycleStatus === 'open'"
          label="Create task"
          icon="i-lucide-list-plus"
          size="xs"
          color="neutral"
          variant="soft"
          @click="emit('createTask', row.original)"
        />
      </template>
      <template #empty>
        <div class="py-8 text-center text-sm text-muted">
          No persisted findings for this client yet.
        </div>
      </template>
    </UTable>
  </UCard>
</template>
