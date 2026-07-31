<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type {
  SearchAuthorityLifecycleStatus,
  SearchAuthorityOpportunity
} from '~/types'

defineProps<{
  opportunities: SearchAuthorityOpportunity[]
  loading: boolean
  busyOpportunityId?: string | null
}>()

const emit = defineEmits<{
  transition: [
    opportunity: SearchAuthorityOpportunity,
    status: SearchAuthorityLifecycleStatus
  ]
  createTask: [opportunity: SearchAuthorityOpportunity]
}>()

const columns: TableColumn<SearchAuthorityOpportunity>[] = [
  { id: 'opportunity', accessorKey: 'title', header: 'Opportunity' },
  { id: 'evidence', accessorKey: 'score', header: 'Evidence' },
  { id: 'status', accessorKey: 'lifecycleStatus', header: 'Status' },
  { id: 'actions', accessorKey: 'id', header: '' }
]

const statusColors: Partial<Record<
  SearchAuthorityLifecycleStatus,
  'neutral' | 'info' | 'success' | 'warning' | 'error'
>> = {
  new: 'info',
  under_review: 'warning',
  accepted: 'success',
  task_created: 'success',
  in_progress: 'warning',
  published: 'success',
  measuring: 'info',
  closed: 'neutral',
  dismissed: 'neutral',
  duplicate: 'neutral',
  expired: 'neutral',
  not_actionable: 'neutral'
}

function label(value: string): string {
  return value.replaceAll('_', ' ').replace(/\b\w/g, character => (
    character.toUpperCase()
  ))
}

function observed(value: number | string | null): string {
  if (value === null) return 'Not available'
  if (typeof value === 'number') {
    return Number.isInteger(value) ? value.toLocaleString('en-AU') : String(value)
  }
  return value
}
</script>

<template>
  <UCard>
    <template #header>
      <div>
        <h2 class="font-semibold text-highlighted">
          Opportunity queue
        </h2>
        <p class="mt-1 text-sm text-muted">
          Deterministic findings with review-first workflow controls.
        </p>
      </div>
    </template>

    <UTable
      :data="opportunities"
      :columns="columns"
      :loading="loading"
      data-testid="search-authority-opportunities"
    >
      <template #opportunity-cell="{ row }">
        <div class="max-w-xl">
          <p class="font-medium text-highlighted">
            {{ row.original.title }}
          </p>
          <p class="mt-1 line-clamp-2 text-sm text-muted">
            {{ row.original.summary }}
          </p>
          <a
            v-if="row.original.pageUrl"
            :href="row.original.pageUrl"
            target="_blank"
            rel="noopener noreferrer"
            class="mt-2 inline-flex max-w-full items-center gap-1 truncate text-xs text-primary hover:underline"
          >
            <UIcon name="i-lucide-external-link" class="size-3 shrink-0" />
            {{ row.original.pageUrl }}
          </a>
        </div>
      </template>

      <template #evidence-cell="{ row }">
        <div class="min-w-48 space-y-2">
          <div class="flex items-center gap-2">
            <UBadge
              :label="`Score ${row.original.score}`"
              color="primary"
              variant="subtle"
            />
            <span class="text-xs text-muted">
              {{ Math.round(row.original.confidence * 100) }}% confidence
            </span>
          </div>
          <ul class="space-y-1">
            <li
              v-for="reason in row.original.reasonCodes.slice(0, 3)"
              :key="reason.code"
              class="text-xs text-muted"
            >
              {{ label(reason.code) }}:
              <span class="text-default">{{ observed(reason.observed) }}</span>
            </li>
          </ul>
          <UBadge
            v-if="row.original.provider.provisional"
            label="Provider provisional"
            color="warning"
            variant="subtle"
            size="xs"
          />
        </div>
      </template>

      <template #status-cell="{ row }">
        <UBadge
          :label="label(row.original.lifecycleStatus)"
          :color="statusColors[row.original.lifecycleStatus] || 'neutral'"
          variant="subtle"
        />
      </template>

      <template #actions-cell="{ row }">
        <div class="flex justify-end gap-2">
          <UButton
            v-if="row.original.lifecycleStatus === 'new'"
            label="Review"
            size="xs"
            color="neutral"
            variant="soft"
            :loading="busyOpportunityId === row.original.id"
            @click="emit('transition', row.original, 'under_review')"
          />
          <template v-else-if="row.original.lifecycleStatus === 'under_review'">
            <UButton
              label="Dismiss"
              size="xs"
              color="neutral"
              variant="ghost"
              :disabled="busyOpportunityId === row.original.id"
              @click="emit('transition', row.original, 'dismissed')"
            />
            <UButton
              label="Accept"
              size="xs"
              :loading="busyOpportunityId === row.original.id"
              @click="emit('transition', row.original, 'accepted')"
            />
          </template>
          <UButton
            v-else-if="row.original.lifecycleStatus === 'accepted'"
            label="Create task"
            icon="i-lucide-list-plus"
            size="xs"
            :loading="busyOpportunityId === row.original.id"
            @click="emit('createTask', row.original)"
          />
          <UButton
            v-else-if="row.original.taskId"
            :to="`/agency/workflow?task=${row.original.taskId}`"
            label="Open task"
            icon="i-lucide-arrow-up-right"
            size="xs"
            color="neutral"
            variant="soft"
          />
        </div>
      </template>

      <template #empty>
        <div class="py-10 text-center">
          <UIcon
            name="i-lucide-search-check"
            class="mx-auto size-8 text-muted"
          />
          <p class="mt-3 font-medium text-highlighted">
            No opportunities in this view
          </p>
          <p class="mt-1 text-sm text-muted">
            Adjust the lifecycle filter or wait for the next evidence refresh.
          </p>
        </div>
      </template>
    </UTable>
  </UCard>
</template>
