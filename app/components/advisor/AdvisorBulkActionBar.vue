<script setup lang="ts">
// Sticky bottom action bar — appears when the user has selected >= 1
// rows in the advisor table. Each control is a UDropdownMenu (or UPopover
// for the snooze date picker) anchored above the trigger so the menus
// open *up* from the bottom bar instead of being pushed off-screen by
// Floating UI's collision detection.

import { CATEGORIES, CATEGORY_LABELS } from '~~/server/utils/advisorCategories'
import { CalendarDate, parseDate, type DateValue } from '@internationalized/date'
import type { DropdownMenuItem } from '@nuxt/ui'

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

// Shared positioning props for every menu in the bar — open above the
// trigger, left-align, with collision padding so the panel never clips
// the viewport edge.
const POPOVER_CONTENT = {
  side: 'top' as const,
  align: 'start' as const,
  sideOffset: 8,
  collisionPadding: 8,
}

// ── Menu items ─────────────────────────────────────────────────────
const statusItems = computed<DropdownMenuItem[][]>(() => [[
  { label: 'Open', icon: 'i-lucide-circle-dot', onSelect: () => emit('apply', { status: 'open' }) },
  { label: 'In progress', icon: 'i-lucide-loader', onSelect: () => emit('apply', { status: 'in_progress' }) },
  { label: 'Done', icon: 'i-lucide-check-circle-2', onSelect: () => emit('apply', { status: 'done' }) },
]])

const priorityItems = computed<DropdownMenuItem[][]>(() => [[
  { label: 'Low', onSelect: () => emit('apply', { priority: 'low' }) },
  { label: 'Medium', onSelect: () => emit('apply', { priority: 'medium' }) },
  { label: 'High', onSelect: () => emit('apply', { priority: 'high' }) },
]])

const categoryItems = computed<DropdownMenuItem[][]>(() => [
  CATEGORIES.map((c) => ({
    label: CATEGORY_LABELS[c],
    onSelect: () => emit('apply', { category: c }),
  })),
  [{
    label: 'Clear category',
    icon: 'i-lucide-x',
    onSelect: () => emit('apply', { category: null }),
  }],
])

const assigneeItems = computed<DropdownMenuItem[][]>(() => [
  [{ label: 'Unassigned', icon: 'i-lucide-user-x', onSelect: () => emit('apply', { assigned_to: null }) }],
  props.teamMembers.map((m) => ({
    label: m.name,
    onSelect: () => emit('apply', { assigned_to: m.id }),
  })),
])

// ── Snooze date picker ─────────────────────────────────────────────
const snoozeDate = ref('') // YYYY-MM-DD

function toCalendarDate(iso: string): DateValue | null {
  if (!iso) return null
  try { return parseDate(iso.length > 10 ? iso.slice(0, 10) : iso) } catch { return null }
}

const snoozeDateModel = computed({
  get: () => toCalendarDate(snoozeDate.value),
  set: (v: any) => { snoozeDate.value = v ? v.toString() : '' },
})

const dateFormatter = new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'short' })
function formatSnoozeButton(): string {
  const cd = toCalendarDate(snoozeDate.value)
  if (!cd) return 'Snooze'
  const c = cd as CalendarDate
  return `Snooze · ${dateFormatter.format(new Date(c.year, c.month - 1, c.day))}`
}

function applySnooze() {
  if (!snoozeDate.value) return
  emit('apply', { snoozed_until: snoozeDate.value })
  snoozeDate.value = ''
}
function clearSnooze() {
  snoozeDate.value = ''
  emit('apply', { snoozed_until: null })
}

// ── Dismiss confirm ────────────────────────────────────────────────
const confirmDismiss = ref(false)
function askDismiss() { confirmDismiss.value = true }
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
    <UBadge color="primary" variant="solid" size="sm">{{ count }} selected</UBadge>

    <UDropdownMenu :items="statusItems" :content="POPOVER_CONTENT">
      <UButton size="sm" variant="outline" color="neutral" trailing-icon="i-lucide-chevron-down" :loading="loading">
        Status
      </UButton>
    </UDropdownMenu>

    <UDropdownMenu :items="priorityItems" :content="POPOVER_CONTENT">
      <UButton size="sm" variant="outline" color="neutral" trailing-icon="i-lucide-chevron-down" :loading="loading">
        Priority
      </UButton>
    </UDropdownMenu>

    <UDropdownMenu
      :items="categoryItems"
      :content="POPOVER_CONTENT"
      :ui="{ content: 'max-h-72 overflow-y-auto' }"
    >
      <UButton size="sm" variant="outline" color="neutral" trailing-icon="i-lucide-chevron-down" :loading="loading">
        Category
      </UButton>
    </UDropdownMenu>

    <UDropdownMenu
      :items="assigneeItems"
      :content="POPOVER_CONTENT"
      :ui="{ content: 'max-h-72 overflow-y-auto' }"
    >
      <UButton size="sm" variant="outline" color="neutral" trailing-icon="i-lucide-chevron-down" :loading="loading">
        Assignee
      </UButton>
    </UDropdownMenu>

    <!-- Snooze: keeps UPopover because it embeds a calendar + apply/clear,
         which is a flow UDropdownMenu can't represent cleanly. -->
    <UPopover :content="POPOVER_CONTENT">
      <UButton
        size="sm"
        variant="outline"
        color="neutral"
        icon="i-lucide-bell-off"
        trailing-icon="i-lucide-chevron-down"
        :loading="loading"
      >
        {{ formatSnoozeButton() }}
      </UButton>
      <template #content>
        <UCalendar v-model="snoozeDateModel" class="p-2" />
        <div class="border-t border-default p-2 flex justify-between gap-2">
          <UButton size="xs" variant="ghost" color="neutral" @click="clearSnooze">Clear snooze</UButton>
          <UButton size="xs" :disabled="!snoozeDate" @click="applySnooze">Apply</UButton>
        </div>
      </template>
    </UPopover>

    <div class="w-px h-6 bg-default/40 mx-1" />

    <UButton size="sm" color="error" variant="ghost" :loading="loading" @click="askDismiss">Dismiss</UButton>
    <UButton
      icon="i-lucide-x"
      size="sm"
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
