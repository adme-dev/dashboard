<script setup lang="ts">
import { format } from 'date-fns'
import type { Lead } from '~/types'

const { filters, page, pageSize, data, pending, refresh } = useLeads()
const { events: liveEvents } = useLeadsStream()

// When SSE pings, refresh the list (cheap — current view only).
// Debounce to 500 ms to absorb burst arrivals (e.g. 10 leads/sec).
const debouncedRefresh = useDebounceFn(() => refresh(), 500)
watch(liveEvents, () => debouncedRefresh(), { deep: true })

const selectedLead = ref<Lead | null>(null)
const showSlideover = ref(false)
const showManualModal = ref(false)
const toast = useToast()

const columns = [
  { accessorKey: 'submitted_at', header: 'When' },
  { accessorKey: 'client_id', header: 'Client' },
  { accessorKey: 'source', header: 'Source' },
  { accessorKey: 'form_name', header: 'Form' },
  { accessorKey: 'summary', header: 'Lead' },
  { accessorKey: 'status', header: 'Status' },
  { accessorKey: 'assigned_to', header: 'Assigned' },
  { accessorKey: 'actions', header: '' },
]

function summarize(lead: Lead): string {
  const f = lead.field_data ?? {}
  return [f.full_name, f.email, f.phone_number ?? f.phone].filter(Boolean).slice(0, 2).join(' · ')
}

function openLead(lead: Lead) {
  selectedLead.value = lead
  showSlideover.value = true
}

async function exportCsv() {
  // Build query from current filters; let browser navigate so the file downloads.
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(filters.value)) {
    if (v == null || v === '' || v === false) continue
    q.set(k, String(v))
  }
  window.open(`/api/leads/export?${q.toString()}`, '_blank')
}
</script>

<template>
  <div class="flex flex-col h-full">
    <div class="flex items-center justify-between px-4 py-3 border-b border-default">
      <h2 class="text-base font-semibold">Inbox <span v-if="data?.total" class="text-muted font-normal">— {{ data.total }} total</span></h2>
      <div class="flex items-center gap-2">
        <UButton icon="i-lucide-download" variant="ghost" size="sm" @click="exportCsv">CSV</UButton>
        <UButton icon="i-lucide-plus" color="primary" size="sm" @click="showManualModal = true">Manual lead</UButton>
        <UButton icon="i-lucide-refresh-cw" variant="ghost" size="sm" @click="refresh()">Refresh</UButton>
      </div>
    </div>

    <LeadsInboxFilters v-model:filters="filters" />

    <div class="flex-1 overflow-auto">
      <UTable :data="data?.items ?? []" :columns="columns" :loading="pending" class="w-full">
        <template #submitted_at-cell="{ row }">
          <span class="text-sm whitespace-nowrap">{{ format(new Date(row.original.submitted_at), 'MMM d, HH:mm') }}</span>
        </template>
        <template #client_id-cell="{ row }">
          <span v-if="row.original.client_id" class="text-sm">{{ row.original.client_id.slice(0, 8) }}…</span>
          <UBadge v-else color="warning" variant="soft" size="sm">Unmapped</UBadge>
        </template>
        <template #source-cell="{ row }">
          <LeadsSourceIcon :source="row.original.source" />
        </template>
        <template #form_name-cell="{ row }">
          <span class="text-sm">{{ row.original.form_name || row.original.form_id || '—' }}</span>
        </template>
        <template #summary-cell="{ row }">
          <button class="text-left text-sm hover:underline" @click="openLead(row.original)">
            {{ summarize(row.original) || '—' }}
          </button>
        </template>
        <template #status-cell="{ row }">
          <LeadsStatusBadge :status="row.original.status" />
        </template>
        <template #assigned_to-cell="{ row }">
          <span class="text-xs text-muted">{{ row.original.assigned_to ? row.original.assigned_to.slice(0, 8) + '…' : '—' }}</span>
        </template>
        <template #actions-cell="{ row }">
          <LeadsInboxRowActions :lead="row.original" @changed="refresh()" />
        </template>
      </UTable>
    </div>

    <div class="border-t border-default p-3 flex items-center justify-between">
      <span class="text-xs text-muted">Page {{ page }} of {{ Math.max(1, Math.ceil((data?.total ?? 0) / pageSize)) }}</span>
      <UPagination
        v-model:page="page"
        :total="data?.total ?? 0"
        :items-per-page="pageSize"
        :sibling-count="1"
      />
    </div>

    <LeadsLeadDetailSlideover
      v-model:open="showSlideover"
      :lead-id="selectedLead?.id ?? null"
      @changed="refresh()"
    />
    <LeadsManualLeadModal
      v-model:open="showManualModal"
      @created="refresh()"
    />
  </div>
</template>
