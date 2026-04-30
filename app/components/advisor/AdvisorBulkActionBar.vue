<script setup lang="ts">
// Sticky bottom action bar — appears when the user has selected >= 1
// rows in the advisor table. Each control opens a UPopover; on commit
// the parent emits the result via @applied (the parent owns the
// /bulk POST and refresh logic).

import { CATEGORIES, CATEGORY_LABELS } from '~~/server/utils/advisorCategories'

type BulkPatch = {
  status?: 'open' | 'in_progress' | 'done' | 'dismissed' | null
  priority?: 'low' | 'medium' | 'high' | null
  category?: string | null
  assigned_to?: string | null
  snoozed_until?: string | null
}

const props = defineProps<{
  count: number
  loading: boolean
  teamMembers: Array<{ id: string; name: string }>
}>()

const emit = defineEmits<{
  (e: 'apply', patch: BulkPatch): void
  (e: 'clear'): void
  (e: 'dismiss-confirm'): void
}>()

const STATUS_OPTIONS = [
  { value: 'open', label: 'Open' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'done', label: 'Done' },
]
const PRIORITY_OPTIONS = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
]
const NONE = '__none__'
const UNASSIGNED = '__unassigned__'

const CATEGORY_OPTIONS = [
  { value: NONE, label: '— Clear category —' },
  ...CATEGORIES.map((c) => ({ value: c, label: CATEGORY_LABELS[c] })),
]

const assigneeOptions = computed(() => ([
  { value: UNASSIGNED, label: 'Unassigned' },
  ...props.teamMembers.map((m) => ({ value: m.id, label: m.name })),
]))

const snoozeDate = ref('')

function applyStatus(v: string) {
  emit('apply', { status: v as any })
}
function applyPriority(v: string) {
  emit('apply', { priority: v as any })
}
function applyCategory(v: string) {
  emit('apply', { category: v === NONE ? null : v })
}
function applyAssignee(v: string) {
  emit('apply', { assigned_to: v === UNASSIGNED ? null : v })
}
function applySnooze() {
  if (!snoozeDate.value) return
  emit('apply', { snoozed_until: snoozeDate.value })
  snoozeDate.value = ''
}
function clearSnooze() {
  emit('apply', { snoozed_until: null })
}

const confirmDismiss = ref(false)
function askDismiss() {
  confirmDismiss.value = true
}
function doDismiss() {
  confirmDismiss.value = false
  emit('apply', { status: 'dismissed' })
}
</script>

<template>
  <div
    v-if="count > 0"
    class="fixed bottom-4 left-1/2 -translate-x-1/2 z-40
           bg-default border border-default rounded-lg shadow-lg
           flex items-center gap-2 px-3 py-2 pb-safe"
  >
    <UBadge color="primary" variant="solid" size="xs">{{ count }} selected</UBadge>

    <!-- Status -->
    <UPopover>
      <UButton size="xs" variant="outline" color="neutral" :loading="loading">Status ▾</UButton>
      <template #content>
        <div class="p-1 min-w-[160px]">
          <button
            v-for="o in STATUS_OPTIONS"
            :key="o.value"
            class="w-full text-left px-2 py-1.5 text-sm hover:bg-elevated rounded"
            @click="applyStatus(o.value)"
          >{{ o.label }}</button>
        </div>
      </template>
    </UPopover>

    <!-- Priority -->
    <UPopover>
      <UButton size="xs" variant="outline" color="neutral" :loading="loading">Priority ▾</UButton>
      <template #content>
        <div class="p-1 min-w-[140px]">
          <button
            v-for="o in PRIORITY_OPTIONS"
            :key="o.value"
            class="w-full text-left px-2 py-1.5 text-sm hover:bg-elevated rounded"
            @click="applyPriority(o.value)"
          >{{ o.label }}</button>
        </div>
      </template>
    </UPopover>

    <!-- Category -->
    <UPopover>
      <UButton size="xs" variant="outline" color="neutral" :loading="loading">Category ▾</UButton>
      <template #content>
        <div class="p-1 min-w-[180px] max-h-72 overflow-y-auto">
          <button
            v-for="o in CATEGORY_OPTIONS"
            :key="o.value"
            class="w-full text-left px-2 py-1.5 text-sm hover:bg-elevated rounded"
            @click="applyCategory(o.value)"
          >{{ o.label }}</button>
        </div>
      </template>
    </UPopover>

    <!-- Assignee -->
    <UPopover>
      <UButton size="xs" variant="outline" color="neutral" :loading="loading">Assignee ▾</UButton>
      <template #content>
        <div class="p-1 min-w-[180px] max-h-72 overflow-y-auto">
          <button
            v-for="o in assigneeOptions"
            :key="o.value"
            class="w-full text-left px-2 py-1.5 text-sm hover:bg-elevated rounded"
            @click="applyAssignee(o.value)"
          >{{ o.label }}</button>
        </div>
      </template>
    </UPopover>

    <!-- Snooze until -->
    <UPopover>
      <UButton size="xs" variant="outline" color="neutral" :loading="loading">Snooze ▾</UButton>
      <template #content>
        <div class="p-2 space-y-2 min-w-[180px]">
          <UInput v-model="snoozeDate" type="date" size="xs" />
          <div class="flex gap-1.5">
            <UButton size="xs" :disabled="!snoozeDate" @click="applySnooze">Apply</UButton>
            <UButton size="xs" variant="ghost" color="neutral" @click="clearSnooze">Clear</UButton>
          </div>
        </div>
      </template>
    </UPopover>

    <div class="w-px h-6 bg-default/40 mx-1" />

    <UButton size="xs" color="error" variant="ghost" :loading="loading" @click="askDismiss">Dismiss</UButton>
    <UButton
      icon="i-lucide-x"
      size="xs"
      color="neutral"
      variant="ghost"
      @click="emit('clear')"
    />

    <!-- Dismiss confirmation -->
    <UModal :open="confirmDismiss" :ui="{ content: 'max-w-sm' }" @update:open="(v: boolean) => v || (confirmDismiss = false)">
      <template #content>
        <div class="p-5 space-y-3">
          <h3 class="font-semibold">Dismiss {{ count }} recommendation{{ count === 1 ? '' : 's' }}?</h3>
          <p class="text-sm text-muted">Dismissed recs are hidden from the active view but kept for audit.</p>
          <div class="flex justify-end gap-2">
            <UButton variant="ghost" color="neutral" size="sm" @click="confirmDismiss = false">Cancel</UButton>
            <UButton color="error" size="sm" @click="doDismiss">Dismiss</UButton>
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>
