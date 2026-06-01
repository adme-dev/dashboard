<script setup lang="ts">
import type { CrmCompany } from '~/types/crm'

const props = defineProps<{ clientId: string }>()
const clientId = toRef(props, 'clientId')
const { data, pending, refresh, search, lifecycle, tag, filters, create, update, remove } = useCrmCompanies(clientId)
const toast = useToast()

const slideoverOpen = ref(false)
const editing = ref<CrmCompany | null>(null)
const fieldsOpen = ref(false)

// F9 — selection + bulk + export.
const selected = ref<Set<string>>(new Set())
const selectedIds = computed(() => [...selected.value])
function toggleRow(id: string, on: boolean) { on ? selected.value.add(id) : selected.value.delete(id); selected.value = new Set(selected.value) }
function clearSelection() { selected.value = new Set() }
async function onBulkDone() { clearSelection(); await refresh() }
watch(data, () => { if (selected.value.size) clearSelection() })
const pageIds = computed(() => (data.value?.items ?? []).map(c => c.id))
const allSelected = computed(() => pageIds.value.length > 0 && pageIds.value.every(id => selected.value.has(id)))
function toggleAll(on: boolean) {
  const next = new Set(selected.value)
  for (const id of pageIds.value) on ? next.add(id) : next.delete(id)
  selected.value = next
}
const exportBase = inject<string>('crmApiBase', '/api/crm')
function exportUrl(format: 'csv' | 'xlsx') {
  const p = new URLSearchParams({ entity: 'companies', format })
  if (exportBase === '/api/crm') p.set('client_id', clientId.value)
  if (search.value.trim()) p.set('q', search.value.trim())
  if (filters.value.length) p.set('filters', JSON.stringify(filters.value))
  return `${exportBase}/export?${p.toString()}`
}

// Lifecycle + tag filters (sentinel-safe: 'all' ⇒ no filter).
const lifecycleFilter = computed({
  get: () => lifecycle.value ?? 'all',
  set: (v: string) => { lifecycle.value = v === 'all' ? null : v },
})
const tagFilter = computed({
  get: () => tag.value ?? 'all',
  set: (v: string) => { tag.value = v === 'all' ? null : v },
})
const tagOptions = computed(() => {
  const set = new Set<string>()
  for (const c of data.value?.items ?? []) for (const t of (c.tags ?? [])) set.add(t)
  if (tag.value) set.add(tag.value)
  return [{ label: 'All tags', value: 'all' }, ...[...set].sort().map(t => ({ label: t, value: t }))]
})

const columns = [
  { accessorKey: 'select', header: 'select' },
  { accessorKey: 'name', header: 'Name' },
  { accessorKey: 'domain', header: 'Domain' },
  { accessorKey: 'lifecycle', header: 'Lifecycle' },
  { accessorKey: 'city', header: 'City' },
  { accessorKey: 'actions', header: '' },
]

function openNew() { editing.value = null; slideoverOpen.value = true }
function openEdit(c: CrmCompany) { editing.value = c; slideoverOpen.value = true }

async function onSave(body: Record<string, unknown>) {
  try {
    if (editing.value) await update(editing.value.id, body)
    else await create(body)
    slideoverOpen.value = false
    toast.add({ title: editing.value ? 'Company updated' : 'Company created', color: 'success' })
  } catch (e: any) {
    toast.add({ title: 'Save failed', description: e?.data?.statusMessage || e?.message, color: 'error' })
  }
}
async function onDelete(c: CrmCompany) {
  try { await remove(c.id); toast.add({ title: 'Company deleted', color: 'success' }) }
  catch (e: any) { toast.add({ title: 'Delete failed', description: e?.data?.statusMessage || e?.message, color: 'error' }) }
}
</script>

<template>
  <div class="space-y-3">
    <div class="flex items-center gap-2">
      <UInput v-model="search" placeholder="Search companies…" icon="i-lucide-search" class="flex-1" />
      <UButton icon="i-lucide-sliders-horizontal" variant="ghost" color="neutral" @click="fieldsOpen = true">Fields</UButton>
      <UButton icon="i-lucide-plus" @click="openNew">Add company</UButton>
    </div>

    <div class="flex flex-wrap items-center gap-2">
      <USelectMenu v-model="lifecycleFilter" :items="LIFECYCLE_FILTER_OPTIONS" value-key="value" size="sm" class="w-44" />
      <USelectMenu v-model="tagFilter" :items="tagOptions" value-key="value" size="sm" class="w-44" searchable />
      <CrmFilterBuilder v-model="filters" entity="companies" />
      <CrmSavedViews v-model="filters" entity="companies" :client-id="clientId" />
      <div class="flex-1" />
      <UDropdownMenu :items="[[
        { label: 'Export CSV', icon: 'i-lucide-file-text', to: exportUrl('csv'), target: '_blank', external: true },
        { label: 'Export Excel', icon: 'i-lucide-sheet', to: exportUrl('xlsx'), target: '_blank', external: true },
      ]]">
        <UButton icon="i-lucide-download" variant="ghost" color="neutral" size="sm" trailing-icon="i-lucide-chevron-down">Export</UButton>
      </UDropdownMenu>
    </div>

    <CrmBulkBar
      v-if="selectedIds.length"
      entity="companies"
      :client-id="clientId"
      :selected-ids="selectedIds"
      @done="onBulkDone"
    />

    <UTable :data="data?.items ?? []" :columns="columns" :loading="pending">
      <template #select-header>
        <UCheckbox :model-value="allSelected" aria-label="Select all" @update:model-value="(v: boolean) => toggleAll(!!v)" />
      </template>
      <template #select-cell="{ row }">
        <UCheckbox
          :model-value="selected.has(row.original.id)"
          :aria-label="`Select ${row.original.name}`"
          @update:model-value="(v: boolean) => toggleRow(row.original.id, !!v)"
        />
      </template>
      <template #name-cell="{ row }">
        <button class="font-medium text-highlighted hover:underline" @click="openEdit(row.original)">
          {{ row.original.name }}
        </button>
      </template>
      <template #domain-cell="{ row }">
        <span class="text-muted">{{ row.original.domain || '—' }}</span>
      </template>
      <template #lifecycle-cell="{ row }">
        <div class="flex flex-wrap items-center gap-1">
          <UBadge v-if="row.original.lifecycle_stage" :color="(lifecycleColor(row.original.lifecycle_stage) as any)" variant="subtle" size="sm">
            {{ lifecycleLabel(row.original.lifecycle_stage) }}
          </UBadge>
          <span v-else class="text-xs text-muted">—</span>
          <UBadge v-for="t in (row.original.tags || [])" :key="t" color="neutral" variant="soft" size="sm">{{ t }}</UBadge>
        </div>
      </template>
      <template #city-cell="{ row }">
        <span class="text-muted">{{ row.original.city || '—' }}</span>
      </template>
      <template #actions-cell="{ row }">
        <UDropdownMenu :items="[[
          { label: 'Edit', icon: 'i-lucide-pen', onSelect: () => openEdit(row.original) },
          { label: 'Delete', icon: 'i-lucide-trash-2', color: 'error', onSelect: () => onDelete(row.original) },
        ]]">
          <UButton icon="i-lucide-ellipsis" variant="ghost" color="neutral" size="xs" />
        </UDropdownMenu>
      </template>
      <template #empty>
        <div class="py-8 text-center text-sm text-muted">No companies yet.</div>
      </template>
    </UTable>

    <CrmRecordSlideover
      v-model:open="slideoverOpen"
      object-type="company"
      :client-id="clientId"
      :record="editing"
      @save="onSave"
    />
    <CrmCustomFieldsManager v-model:open="fieldsOpen" object-type="company" :client-id="clientId" />
  </div>
</template>
