<script setup lang="ts">
// Filters extracted from app/pages/advisor/index.vue. State (statusFilter,
// priorityFilter, clientFilter, periodFilter, assigneeFilter, categoryFilter)
// lives in the parent; this component is presentational with v-model props.

import { CATEGORIES, CATEGORY_LABELS } from '~~/server/utils/advisorCategories'

type StatusFilter = 'active' | 'all' | 'open' | 'in_progress' | 'done' | 'dismissed'
type PriorityFilter = 'all' | 'low' | 'medium' | 'high'
type SourceFilter = 'all' | 'ai' | 'manual'

defineProps<{
  status: StatusFilter
  priority: PriorityFilter
  client: string
  period: string
  assignee: string
  category: string
  source: SourceFilter
  showSnoozed: boolean
  clientOptions: Array<{ label: string; value: string }>
  periodOptions: Array<{ label: string; value: string }>
  assigneeOptions: Array<{ label: string; value: string }>
}>()

const emit = defineEmits<{
  (e: 'update:status', v: StatusFilter): void
  (e: 'update:priority', v: PriorityFilter): void
  (e: 'update:client', v: string): void
  (e: 'update:period', v: string): void
  (e: 'update:assignee', v: string): void
  (e: 'update:category', v: string): void
  (e: 'update:source', v: SourceFilter): void
  (e: 'update:showSnoozed', v: boolean): void
}>()

const SOURCE_OPTIONS: Array<{ label: string; value: SourceFilter }> = [
  { label: 'All', value: 'all' },
  { label: 'AI', value: 'ai' },
  { label: 'Manual', value: 'manual' },
]

const STATUS_OPTIONS: Array<{ label: string; value: StatusFilter }> = [
  { label: 'Active', value: 'active' },
  { label: 'Open', value: 'open' },
  { label: 'In progress', value: 'in_progress' },
  { label: 'Done', value: 'done' },
  { label: 'Dismissed', value: 'dismissed' },
  { label: 'All', value: 'all' },
]

const PRIORITY_OPTIONS = [
  { label: 'All priorities', value: 'all' },
  { label: 'Low', value: 'low' },
  { label: 'Medium', value: 'medium' },
  { label: 'High', value: 'high' },
]

const CHIP_OPTIONS = [
  { value: 'all', label: 'All' },
  ...CATEGORIES.map((c) => ({ value: c, label: CATEGORY_LABELS[c] })),
  { value: 'none', label: 'Uncategorized' },
] as const
</script>

<template>
  <UCard>
    <div class="flex flex-wrap gap-2 items-center">
      <UButtonGroup>
        <UButton
          v-for="o in STATUS_OPTIONS"
          :key="o.value"
          :color="status === o.value ? 'primary' : 'neutral'"
          :variant="status === o.value ? 'solid' : 'outline'"
          size="sm"
          @click="emit('update:status', o.value)"
        >{{ o.label }}</UButton>
      </UButtonGroup>

      <div class="grow" />

      <USelectMenu
        :model-value="priority"
        :items="PRIORITY_OPTIONS"
        value-key="value"
        size="sm"
        class="w-40"
        @update:model-value="(v: any) => emit('update:priority', v)"
      />
      <USelectMenu
        :model-value="client"
        :items="clientOptions"
        value-key="value"
        size="sm"
        class="w-52"
        @update:model-value="(v: any) => emit('update:client', v)"
      />
      <USelectMenu
        :model-value="period"
        :items="periodOptions"
        value-key="value"
        size="sm"
        class="w-44"
        @update:model-value="(v: any) => emit('update:period', v)"
      />
      <USelectMenu
        :model-value="assignee"
        :items="assigneeOptions"
        value-key="value"
        size="sm"
        class="w-48"
        @update:model-value="(v: any) => emit('update:assignee', v)"
      />
    </div>

    <!-- Category chip strip -->
    <div class="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-default">
      <UBadge
        v-for="opt in CHIP_OPTIONS"
        :key="opt.value"
        :color="category === opt.value ? 'primary' : 'neutral'"
        :variant="category === opt.value ? 'solid' : 'subtle'"
        size="xs"
        class="cursor-pointer select-none"
        @click="emit('update:category', opt.value)"
      >
        {{ opt.label }}
      </UBadge>
    </div>

    <!-- Source toggle + show-snoozed -->
    <div class="flex flex-wrap items-center gap-3 mt-3 pt-3 border-t border-default">
      <span class="text-xs text-muted">Source:</span>
      <UButtonGroup>
        <UButton
          v-for="o in SOURCE_OPTIONS"
          :key="o.value"
          :color="source === o.value ? 'primary' : 'neutral'"
          :variant="source === o.value ? 'solid' : 'outline'"
          size="xs"
          @click="emit('update:source', o.value)"
        >{{ o.label }}</UButton>
      </UButtonGroup>

      <div class="grow" />

      <UCheckbox
        :model-value="showSnoozed"
        label="Show snoozed"
        @update:model-value="(v: boolean) => emit('update:showSnoozed', v)"
      />
    </div>
  </UCard>
</template>
