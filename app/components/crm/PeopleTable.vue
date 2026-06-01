<script setup lang="ts">
import type { CrmPerson } from '~/types/crm'

const props = defineProps<{ clientId: string }>()
const clientId = toRef(props, 'clientId')
const { data, pending, search, create, update, remove, importCsv } = useCrmPeople(clientId)
const toast = useToast()

const slideoverOpen = ref(false)
const editing = ref<CrmPerson | null>(null)
const importOpen = ref(false)
const fieldsOpen = ref(false)

// Lead scores are an agency-only feature (endpoints live under /api/crm).
const base = inject<string>('crmApiBase', '/api/crm')
const isAgency = base === '/api/crm'
const scoreQuery = computed(() => ({ client_id: clientId.value, target_type: 'person' }))
const { data: scoreData, refresh: refreshScores } = useFetch<{ byTarget: Record<string, { total_score: number, grade: string }> }>('/api/crm/scoring', {
  query: scoreQuery, watch: [scoreQuery], immediate: isAgency, default: () => ({ byTarget: {} }),
})
const scoreOf = (id: string) => scoreData.value?.byTarget?.[id] ?? null
const gradeColor: Record<string, string> = { Hot: 'success', Warm: 'warning', Cold: 'neutral' }

const sortByScore = ref(false)
const rows = computed(() => {
  const items = data.value?.items ?? []
  if (!sortByScore.value) return items
  return [...items].sort((a, b) => (scoreOf(b.id)?.total_score ?? -1) - (scoreOf(a.id)?.total_score ?? -1))
})

const columns = computed(() => [
  { accessorKey: 'name', header: 'Name' },
  { accessorKey: 'email', header: 'Email' },
  { accessorKey: 'phone', header: 'Phone' },
  { accessorKey: 'job_title', header: 'Title' },
  ...(isAgency ? [{ accessorKey: 'score', header: 'Score' }] : []),
  { accessorKey: 'actions', header: '' },
])

const rescoring = ref(false)
async function rescoreAll() {
  rescoring.value = true
  try {
    await $fetch('/api/crm/scoring/compute', { method: 'POST', body: { client_id: clientId.value, target_type: 'person', all: true } })
    await refreshScores()
    toast.add({ title: 'Scores recomputed', color: 'success' })
  } catch (e: any) {
    toast.add({ title: 'Could not recompute', description: e?.data?.statusMessage || e?.message, color: 'error' })
  } finally {
    rescoring.value = false
  }
}

function fullName(p: CrmPerson) {
  return [p.first_name, p.last_name].filter(Boolean).join(' ')
}
function openNew() { editing.value = null; slideoverOpen.value = true }
function openEdit(p: CrmPerson) { editing.value = p; slideoverOpen.value = true }

async function onSave(body: Record<string, unknown>) {
  try {
    if (editing.value) await update(editing.value.id, body)
    else await create(body)
    slideoverOpen.value = false
    toast.add({ title: editing.value ? 'Person updated' : 'Person created', color: 'success' })
  } catch (e: any) {
    toast.add({ title: 'Save failed', description: e?.data?.statusMessage || e?.message, color: 'error' })
  }
}
async function onDelete(p: CrmPerson) {
  try { await remove(p.id); toast.add({ title: 'Person deleted', color: 'success' }) }
  catch (e: any) { toast.add({ title: 'Delete failed', description: e?.data?.statusMessage || e?.message, color: 'error' }) }
}
async function onImport(csv: string) {
  const r = await importCsv(csv)
  toast.add({ title: `Imported ${r.imported}, skipped ${r.skipped}, errors ${r.errors.length}`, color: r.errors.length ? 'warning' : 'success' })
  return r
}
</script>

<template>
  <div class="space-y-3">
    <div class="flex items-center gap-2">
      <UInput v-model="search" placeholder="Search people…" icon="i-lucide-search" class="flex-1" />
      <UButton
        v-if="isAgency"
        :icon="sortByScore ? 'i-lucide-arrow-down-wide-narrow' : 'i-lucide-arrow-up-down'"
        :variant="sortByScore ? 'soft' : 'ghost'"
        color="neutral"
        @click="sortByScore = !sortByScore"
      >Score</UButton>
      <UButton v-if="isAgency" icon="i-lucide-refresh-cw" variant="ghost" color="neutral" :loading="rescoring" @click="rescoreAll">Rescore</UButton>
      <UButton icon="i-lucide-sliders-horizontal" variant="ghost" color="neutral" @click="fieldsOpen = true">Fields</UButton>
      <UButton icon="i-lucide-upload" variant="ghost" color="neutral" @click="importOpen = true">Import</UButton>
      <UButton icon="i-lucide-plus" @click="openNew">Add person</UButton>
    </div>

    <UTable :data="rows" :columns="columns" :loading="pending">
      <template #name-cell="{ row }">
        <button class="font-medium text-highlighted hover:underline" @click="openEdit(row.original)">
          {{ fullName(row.original) }}
        </button>
      </template>
      <template #email-cell="{ row }">
        <span class="text-muted">{{ row.original.email || '—' }}</span>
      </template>
      <template #phone-cell="{ row }">
        <span class="text-muted">{{ row.original.phone || row.original.mobile || '—' }}</span>
      </template>
      <template #job_title-cell="{ row }">
        <span class="text-muted">{{ row.original.job_title || '—' }}</span>
      </template>
      <template #score-cell="{ row }">
        <UBadge v-if="scoreOf(row.original.id)" :color="(gradeColor[scoreOf(row.original.id)!.grade] as any)" variant="subtle" size="sm">
          {{ scoreOf(row.original.id)!.grade }} · {{ scoreOf(row.original.id)!.total_score }}
        </UBadge>
        <span v-else class="text-xs text-muted">—</span>
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
        <div class="py-8 text-center text-sm text-muted">No people yet. Add one or import a CSV.</div>
      </template>
    </UTable>

    <CrmRecordSlideover
      v-model:open="slideoverOpen"
      object-type="person"
      :client-id="clientId"
      :record="editing"
      @save="onSave"
    />
    <CrmCsvImportModal v-model:open="importOpen" :on-import="onImport" />
    <CrmCustomFieldsManager v-model:open="fieldsOpen" object-type="person" :client-id="clientId" />
  </div>
</template>
