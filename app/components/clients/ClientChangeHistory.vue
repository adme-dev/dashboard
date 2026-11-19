<script setup lang="ts">
import { h, resolveComponent } from 'vue'
import { parseDate, type DateValue } from '@internationalized/date'
import type { TableColumn } from '@nuxt/ui'

/** One normalized change, as returned by GET /api/agency/clients/:id/change-history. */
interface ChangeActor { userId: string | null, name: string | null, type: 'user' | 'system' }
interface ChangeEntry {
  id: string
  at: string
  origin: string
  account: { connectionId: string | null, platform: string | null, customerId: string | null, label: string | null } | null
  actor: ChangeActor
  source: string
  actionFamily: string
  risk: string | null
  status: string
  summary: string
  before: unknown
  after: unknown
  approver: ChangeActor | null
  providerRequestId: string | null
  triggerRef: string | null
  rollbackRef: string | null
}
interface ChangeHistoryResponse {
  enabled: boolean
  entries: ChangeEntry[]
  nextCursor: string | null
  more: boolean
}

const props = defineProps<{ clientId: string }>()
const emit = defineEmits<{ availability: [enabled: boolean] }>()

const UBadge = resolveComponent('UBadge')
const UTooltip = resolveComponent('UTooltip')

const entries = ref<ChangeEntry[]>([])
const nextCursor = ref<string | null>(null)
const loading = ref(false)
const loadError = ref<string | null>(null)
const enabled = ref<boolean | null>(null)
const startDate = ref('')
const endDate = ref('')
const sourceFilter = ref('all')

const SOURCE_OPTIONS = [
  { label: 'All sources', value: 'all' },
  { label: 'AI proposals', value: 'ai_pending_actions' },
  { label: 'AI actions', value: 'ai_action_audit' },
  { label: 'Google Ads plans', value: 'google_ads_action_plans' },
  { label: 'Budget records', value: 'budget_audit_log' },
  { label: 'Account bindings', value: 'google_ads_account_binding_events' }
]

const STATUS_COLOR: Record<string, 'success' | 'info' | 'warning' | 'error' | 'neutral'> = {
  verified: 'success',
  executed: 'success',
  approved: 'info',
  executing: 'info',
  proposed: 'warning',
  expired: 'neutral',
  cancelled: 'neutral',
  rejected: 'error',
  failed: 'error'
}

const CHANNEL_LABEL: Record<string, string> = {
  mcp: 'Claude / ChatGPT',
  chat: 'XeroFlow chat',
  ui: 'XeroFlow',
  automation: 'Automation',
  migration: 'Data migration',
  unknown: 'Unknown'
}

const dateTime = new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })
const dateOnly = new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })

function toCalendarDate(iso: string): DateValue | null {
  if (!iso) return null
  try {
    return parseDate(iso.slice(0, 10))
  } catch {
    return null
  }
}
function formatDay(iso: string): string {
  const date = toCalendarDate(iso)
  return date ? dateOnly.format(new Date(date.year, date.month - 1, date.day)) : ''
}
const startModel = computed({
  get: () => toCalendarDate(startDate.value),
  set: (value: DateValue | null) => { startDate.value = value ? value.toString() : '' }
})
const endModel = computed({
  get: () => toCalendarDate(endDate.value),
  set: (value: DateValue | null) => { endDate.value = value ? value.toString() : '' }
})

function clearDate(which: 'start' | 'end'): void {
  if (which === 'start') startDate.value = ''
  else endDate.value = ''
}

/** Compact before → after text for budget-shaped and generic payloads. */
function describeState(value: unknown): string {
  if (value === null || value === undefined) return '—'
  if (Array.isArray(value)) {
    if (!value.length) return '—'
    const budgets = value.map(item => (item && typeof item === 'object' ? (item as Record<string, unknown>).budget : undefined))
    if (budgets.every(budget => budget === null || typeof budget === 'number')) {
      return budgets.map(budget => budget === null ? 'none' : `$${(budget as number).toLocaleString('en-AU')}`).join(', ')
    }
    return `${value.length} item${value.length === 1 ? '' : 's'}`
  }
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>
    if ('budget' in record) return record.budget === null ? 'none' : `$${Number(record.budget).toLocaleString('en-AU')}`
    const text = JSON.stringify(record)
    return text.length > 80 ? `${text.slice(0, 77)}…` : text
  }
  return String(value)
}

const columns: TableColumn<ChangeEntry>[] = [
  {
    accessorKey: 'at',
    header: 'When',
    cell: ({ row }) => h('span', { class: 'whitespace-nowrap text-sm text-muted tabular-nums' }, dateTime.format(new Date(row.original.at)))
  },
  {
    accessorKey: 'summary',
    header: 'Change',
    cell: ({ row }) => h('div', { class: 'min-w-64 max-w-md space-y-1' }, [
      h('p', { class: 'text-sm text-highlighted line-clamp-2' }, row.original.summary),
      row.original.account?.label || row.original.account?.customerId
        ? h('p', { class: 'text-xs text-muted' }, [row.original.account.label, row.original.account.customerId].filter(Boolean).join(' / '))
        : null
    ])
  },
  {
    id: 'diff',
    header: 'Before → after',
    cell: ({ row }) => row.original.before === null && row.original.after === null
      ? h('span', { class: 'text-xs text-dimmed' }, 'Not recorded')
      : h('div', { class: 'flex items-center gap-1.5 text-sm tabular-nums whitespace-nowrap' }, [
          h('span', { class: 'text-muted line-through decoration-error/50' }, describeState(row.original.before)),
          h('span', { 'class': 'text-dimmed', 'aria-hidden': 'true' }, '→'),
          h('span', { class: 'text-highlighted font-medium' }, describeState(row.original.after))
        ])
  },
  {
    accessorKey: 'status',
    header: 'Status',
    cell: ({ row }) => h(UBadge, { color: STATUS_COLOR[row.original.status] ?? 'neutral', variant: 'subtle', size: 'sm', class: 'capitalize' }, () => row.original.status)
  },
  {
    id: 'people',
    header: 'Requested / approved',
    cell: ({ row }) => h('div', { class: 'text-sm space-y-0.5' }, [
      h('p', { class: 'text-highlighted' }, row.original.actor.name ?? 'Unknown'),
      h('p', { class: 'text-xs text-muted' }, row.original.approver?.name ? `Approved by ${row.original.approver.name}` : CHANNEL_LABEL[row.original.source] ?? row.original.source)
    ])
  },
  {
    id: 'refs',
    header: 'References',
    cell: ({ row }) => {
      const refs = [
        row.original.providerRequestId ? `Request ${row.original.providerRequestId}` : null,
        row.original.triggerRef ? `Trigger ${row.original.triggerRef}` : null,
        row.original.rollbackRef ? `Rollback ${row.original.rollbackRef}` : null,
        row.original.risk ? `Risk ${row.original.risk}` : null
      ].filter(Boolean) as string[]
      if (!refs.length) return h('span', { class: 'text-xs text-dimmed' }, '—')
      return h(UTooltip, { text: refs.join('\n') }, () => h('span', { class: 'text-xs text-muted underline decoration-dotted cursor-help' }, `${refs.length} reference${refs.length === 1 ? '' : 's'}`))
    }
  }
]

async function load(reset = true) {
  loading.value = true
  loadError.value = null
  try {
    const response = await $fetch<ChangeHistoryResponse>(`/api/agency/clients/${props.clientId}/change-history`, {
      query: {
        limit: 25,
        ...(startDate.value ? { startDate: startDate.value } : {}),
        ...(endDate.value ? { endDate: endDate.value } : {}),
        ...(sourceFilter.value !== 'all' ? { sources: sourceFilter.value } : {}),
        ...(reset || !nextCursor.value ? {} : { cursor: nextCursor.value })
      }
    })
    enabled.value = response.enabled
    emit('availability', response.enabled)
    entries.value = reset ? response.entries : [...entries.value, ...response.entries]
    nextCursor.value = response.nextCursor
  } catch (error: any) {
    loadError.value = error?.data?.statusMessage || error?.statusMessage || 'Could not load the change history.'
  } finally {
    loading.value = false
  }
}

watch([startDate, endDate, sourceFilter], () => load(true))
onMounted(() => load(true))
</script>

<template>
  <section v-if="enabled !== false" aria-labelledby="change-history-heading" class="space-y-4">
    <div class="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div class="space-y-1">
        <h2 id="change-history-heading" class="text-base font-semibold text-highlighted">
          Change history
        </h2>
        <p class="text-sm text-muted max-w-prose">
          Every recorded change to this client's ad accounts and budgets, newest first: who asked, who approved, and what it changed.
        </p>
      </div>
      <div class="grid grid-cols-2 gap-4 md:grid-cols-3 md:w-auto">
        <UFormField label="From">
          <UPopover>
            <UButton
              color="neutral"
              variant="outline"
              icon="i-lucide-calendar"
              class="w-full justify-start font-normal"
              :class="!startDate && 'text-muted'"
            >
              {{ formatDay(startDate) || 'Any date' }}
            </UButton>
            <template #content>
              <UCalendar v-model="startModel" class="p-2" />
              <div v-if="startDate" class="border-t border-default p-2 flex justify-end">
                <UButton
                  size="xs"
                  variant="ghost"
                  color="neutral"
                  @click="clearDate('start')"
                >
                  Clear
                </UButton>
              </div>
            </template>
          </UPopover>
        </UFormField>
        <UFormField label="To">
          <UPopover>
            <UButton
              color="neutral"
              variant="outline"
              icon="i-lucide-calendar"
              class="w-full justify-start font-normal"
              :class="!endDate && 'text-muted'"
            >
              {{ formatDay(endDate) || 'Today' }}
            </UButton>
            <template #content>
              <UCalendar v-model="endModel" class="p-2" />
              <div v-if="endDate" class="border-t border-default p-2 flex justify-end">
                <UButton
                  size="xs"
                  variant="ghost"
                  color="neutral"
                  @click="clearDate('end')"
                >
                  Clear
                </UButton>
              </div>
            </template>
          </UPopover>
        </UFormField>
        <UFormField label="Source" class="col-span-2 md:col-span-1">
          <USelect v-model="sourceFilter" :items="SOURCE_OPTIONS" class="w-full md:w-48" />
        </UFormField>
      </div>
    </div>

    <UAlert
      v-if="loadError"
      color="error"
      variant="subtle"
      icon="i-lucide-alert-triangle"
      :title="loadError"
    />

    <div class="rounded-lg border border-default overflow-x-auto">
      <UTable
        :data="entries"
        :columns="columns"
        :loading="loading"
        class="min-w-full"
      >
        <template #empty>
          <div class="py-10 text-center space-y-1">
            <p class="text-sm text-highlighted">
              No changes recorded{{ startDate || endDate ? ' in this period' : '' }}.
            </p>
            <p class="text-xs text-muted">
              Proposals, approvals and budget edits will appear here as they happen.
            </p>
          </div>
        </template>
      </UTable>
    </div>

    <div v-if="nextCursor" class="flex justify-center">
      <UButton
        color="neutral"
        variant="outline"
        :loading="loading"
        @click="load(false)"
      >
        Load older changes
      </UButton>
    </div>
  </section>
</template>
