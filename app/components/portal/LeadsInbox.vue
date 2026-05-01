<script setup lang="ts">
import { format } from 'date-fns'

interface PortalLead {
  id: string
  source: string
  form_name: string | null
  submitted_at: string
  field_data: Record<string, string>
  status: string
  contacted_at: string | null
}

const status = ref<string>('all')
const page = ref(1)
const PAGE_SIZE = 50

const params = computed(() => {
  const p: Record<string, string> = { page: String(page.value), page_size: String(PAGE_SIZE) }
  if (status.value !== 'all') p.status = status.value
  return p
})

const { data, refresh, pending } = useFetch<{ items: PortalLead[]; total: number }>(
  '/api/client-portal/leads/list',
  { query: params, watch: [params], default: () => ({ items: [], total: 0 }) },
)

const STATUS_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'new', label: 'New' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'qualified', label: 'Qualified' },
  { value: 'won', label: 'Won' },
  { value: 'lost', label: 'Lost' },
]
const toast = useToast()

const columns = [
  { accessorKey: 'submitted_at', header: 'When' },
  { accessorKey: 'form_name', header: 'Form' },
  { accessorKey: 'summary', header: 'Lead' },
  { accessorKey: 'status', header: 'Status' },
  { accessorKey: 'actions', header: '' },
]

function summarize(l: PortalLead): string {
  const f = l.field_data ?? {}
  return [f.full_name, f.email, f.phone_number ?? f.phone].filter(Boolean).slice(0, 2).join(' · ')
}

async function markContacted(l: PortalLead) {
  await $fetch(`/api/client-portal/leads/${l.id}/contacted`, { method: 'POST' })
  toast.add({ title: 'Marked contacted', color: 'success' })
  await refresh()
}

function downloadCsv() { window.open('/api/client-portal/leads/export', '_blank') }
</script>

<template>
  <div class="flex flex-col h-full">
    <div class="flex items-center justify-between px-4 py-3 border-b border-default">
      <div class="flex items-center gap-2">
        <USelectMenu v-model="status" :items="STATUS_OPTIONS" value-key="value" class="w-36" />
        <span class="text-xs text-muted">{{ data?.total ?? 0 }} total</span>
      </div>
      <div class="flex items-center gap-2">
        <UButton size="sm" variant="ghost" icon="i-lucide-download" @click="downloadCsv">CSV</UButton>
        <UButton size="sm" variant="ghost" icon="i-lucide-refresh-cw" @click="refresh()">Refresh</UButton>
      </div>
    </div>

    <div class="flex-1 overflow-auto">
      <UTable :data="data?.items ?? []" :columns="columns" :loading="pending">
        <template #submitted_at-cell="{ row }">
          <span class="text-sm whitespace-nowrap">{{ format(new Date(row.original.submitted_at), 'MMM d, HH:mm') }}</span>
        </template>
        <template #form_name-cell="{ row }">
          <span class="text-sm">{{ row.original.form_name || '—' }}</span>
        </template>
        <template #summary-cell="{ row }">
          <span class="text-sm">{{ summarize(row.original) || '—' }}</span>
        </template>
        <template #status-cell="{ row }">
          <UBadge variant="soft" size="sm">{{ row.original.status }}</UBadge>
        </template>
        <template #actions-cell="{ row }">
          <UButton
            v-if="row.original.status === 'new'"
            size="xs" variant="ghost" icon="i-lucide-check"
            @click="markContacted(row.original)"
          >Mark contacted</UButton>
        </template>
      </UTable>
    </div>

    <div class="border-t border-default p-3 flex items-center justify-end">
      <UPagination v-model:page="page" :total="data?.total ?? 0" :items-per-page="PAGE_SIZE" :sibling-count="1" />
    </div>
  </div>
</template>
