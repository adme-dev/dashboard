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
const showImportModal = ref(false)

// Lookup tables for client + user names — same endpoints the filter dropdown
// uses, so de-duped by Nuxt's useFetch cache.
interface ClientOption { id: string, name: string }
interface UserOption { id: string, name: string }
const { data: clients } = useFetch<ClientOption[]>('/api/agency/clients', { default: () => [] })
const { data: teamData } = useFetch<{ members: UserOption[] }>('/api/agency/team-members', { default: () => ({ members: [] }) })

const clientNameById = computed(() => {
  const m = new Map<string, string>()
  for (const c of clients.value ?? []) m.set(c.id, c.name)
  return m
})
const userNameById = computed(() => {
  const m = new Map<string, string>()
  for (const u of teamData.value?.members ?? []) m.set(u.id, u.name)
  return m
})

const columns = [
  { accessorKey: 'submitted_at', header: 'When' },
  { accessorKey: 'client_id', header: 'Client' },
  { accessorKey: 'source', header: 'Source' },
  { accessorKey: 'form_name', header: 'Form' },
  { accessorKey: 'summary', header: 'Lead' },
  { accessorKey: 'status', header: 'Status' },
  { accessorKey: 'assigned_to', header: 'Assigned' },
  { accessorKey: 'actions', header: '' }
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
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(filters.value)) {
    if (v == null || v === '' || v === false) continue
    q.set(k, String(v))
  }
  window.open(`/api/leads/export?${q.toString()}`, '_blank')
}

const hasItems = computed(() => (data.value?.items?.length ?? 0) > 0)

defineEmits<{ 'show-help': [], 'show-rules': [] }>()
</script>

<template>
  <div class="flex flex-col h-full">
    <div class="flex items-center justify-between px-4 py-3 border-b border-default">
      <h2 class="text-base font-semibold">
        Inbox
        <span v-if="data?.total" class="text-muted font-normal">— {{ data.total }} total</span>
      </h2>
      <div class="flex items-center gap-2">
        <UButton
          icon="i-lucide-help-circle"
          variant="ghost"
          size="sm"
          @click="$emit('show-help')"
        >
          Setup guide
        </UButton>
        <UButton
          icon="i-lucide-route"
          variant="ghost"
          size="sm"
          @click="$emit('show-rules')"
        >
          Set up routing
        </UButton>
        <UButton
          icon="i-lucide-upload-cloud"
          variant="ghost"
          size="sm"
          @click="showImportModal = true"
        >
          Import CSV
        </UButton>
        <UButton
          icon="i-lucide-download"
          variant="ghost"
          size="sm"
          @click="exportCsv"
        >
          Export
        </UButton>
        <UButton
          icon="i-lucide-plus"
          color="primary"
          size="sm"
          @click="showManualModal = true"
        >
          Manual lead
        </UButton>
        <UButton
          icon="i-lucide-refresh-cw"
          variant="ghost"
          size="sm"
          @click="refresh()"
        >
          Refresh
        </UButton>
      </div>
    </div>

    <LeadsInboxFilters v-model:filters="filters" />

    <div class="flex-1 overflow-auto">
      <UTable
        v-if="hasItems || pending"
        :data="data?.items ?? []"
        :columns="columns"
        :loading="pending"
        class="w-full"
        :ui="{
          tr: 'hover:bg-elevated/40 cursor-pointer transition-colors',
          td: 'py-2.5'
        }"
      >
        <template #submitted_at-cell="{ row }">
          <button class="text-left text-sm whitespace-nowrap" @click="openLead(row.original)">
            {{ format(new Date(row.original.submitted_at), 'MMM d, HH:mm') }}
          </button>
        </template>
        <template #client_id-cell="{ row }">
          <button class="text-left" @click="openLead(row.original)">
            <span v-if="row.original.client_id" class="text-sm">
              {{ clientNameById.get(row.original.client_id) ?? row.original.client_id.slice(0, 8) + '…' }}
            </span>
            <UBadge
              v-else
              color="warning"
              variant="soft"
              size="sm"
            >
              Unmapped
            </UBadge>
          </button>
        </template>
        <template #source-cell="{ row }">
          <button class="flex items-center gap-1.5" :aria-label="`Open ${row.original.source} lead`" @click="openLead(row.original)">
            <LeadsSourceIcon :source="row.original.source" />
            <UBadge
              v-if="row.original.is_test"
              color="warning"
              variant="soft"
              size="sm"
              class="font-mono text-[10px]"
            >
              TEST
            </UBadge>
          </button>
        </template>
        <template #form_name-cell="{ row }">
          <button class="text-left text-sm" @click="openLead(row.original)">
            {{ row.original.form_name || row.original.form_id || '—' }}
          </button>
        </template>
        <template #summary-cell="{ row }">
          <button class="text-left text-sm font-medium" @click="openLead(row.original)">
            {{ summarize(row.original) || '—' }}
          </button>
        </template>
        <template #status-cell="{ row }">
          <button @click="openLead(row.original)">
            <LeadsStatusBadge :status="row.original.status" />
          </button>
        </template>
        <template #assigned_to-cell="{ row }">
          <button class="text-left" @click="openLead(row.original)">
            <span v-if="row.original.assigned_to" class="text-xs">
              {{ userNameById.get(row.original.assigned_to) ?? row.original.assigned_to.slice(0, 8) + '…' }}
            </span>
            <span v-else class="text-xs text-muted">—</span>
          </button>
        </template>
        <template #actions-cell="{ row }">
          <div @click.stop>
            <LeadsInboxRowActions :lead="row.original" @changed="refresh()" />
          </div>
        </template>
      </UTable>

      <div v-else class="flex flex-col items-center justify-center h-full text-center px-6 py-12">
        <UIcon name="i-lucide-inbox" class="size-12 text-dimmed mb-3" />
        <h3 class="text-base font-semibold mb-1">
          No leads yet
        </h3>
        <p class="text-sm text-muted max-w-md mb-4">
          Once a configured webhook receives an inquiry, it'll appear here in real time.
          Start with the Setup guide to copy your webhook, then set up routing to map a form to a client — or add a lead manually.
        </p>
        <div class="flex items-center gap-2">
          <UButton
            icon="i-lucide-help-circle"
            color="primary"
            size="sm"
            @click="$emit('show-help')"
          >
            Setup guide
          </UButton>
          <UButton
            icon="i-lucide-route"
            variant="outline"
            size="sm"
            @click="$emit('show-rules')"
          >
            Set up routing
          </UButton>
          <UButton
            icon="i-lucide-plus"
            variant="ghost"
            size="sm"
            @click="showManualModal = true"
          >
            Add manual lead
          </UButton>
        </div>
      </div>
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
    <LeadsBulkImportModal
      v-model:open="showImportModal"
      @imported="refresh()"
    />
  </div>
</template>
