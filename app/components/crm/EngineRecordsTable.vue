<script setup lang="ts">
// List + create/edit/delete for a config object's records. UTable v4 ({accessorKey, header},
// row.original). Columns derive from the first 5 field defs; cells formatted via formatCell.
import { formatCell } from '~/utils/crmFieldControls'
import type { CrmFieldDef } from '~/types/crm'
const props = defineProps<{ clientId: string, objectKey: string }>()
const clientId = toRef(props, 'clientId')
const objectKey = toRef(props, 'objectKey')
const { data, pending, search, create, update, remove } = useCrmRecords(clientId, objectKey)
const toast = useToast()

const fields = computed<CrmFieldDef[]>(() => data.value?.fields ?? [])
const shownFields = computed(() => fields.value.slice(0, 5))
const columns = computed(() => [
  ...shownFields.value.map(f => ({ accessorKey: f.key, header: f.label })),
  { accessorKey: '__actions', header: '' },
])
const rows = computed(() => (data.value?.items ?? []).map(r => ({ ...r.data, __id: r.id, __raw: r })))

const slideoverOpen = ref(false)
const editing = ref<Record<string, unknown> | null>(null)
const editingId = ref<string | null>(null)
function openNew() { editing.value = {}; editingId.value = null; slideoverOpen.value = true }
function openEdit(row: any) { editing.value = { ...row.__raw.data }; editingId.value = row.__id; slideoverOpen.value = true }
async function onSave(form: Record<string, unknown>) {
  try {
    if (editingId.value) await update(editingId.value, form)
    else await create(form)
    slideoverOpen.value = false
  } catch (e: any) { toast.add({ title: 'Save failed', description: e?.data?.statusMessage || e?.message, color: 'error' }) }
}
async function onDelete(row: any) {
  try { await remove(row.__id) }
  catch (e: any) { toast.add({ title: 'Delete failed', description: e?.data?.statusMessage || e?.message, color: 'error' }) }
}
</script>

<template>
  <div class="space-y-3">
    <div class="flex items-center justify-between gap-3">
      <UInput v-model="search" placeholder="Search…" icon="i-lucide-search" class="w-64" />
      <UButton icon="i-lucide-plus" @click="openNew">New</UButton>
    </div>
    <UTable :data="rows" :columns="columns" :loading="pending">
      <template v-for="f in shownFields" :key="f.key" #[`${f.key}-cell`]="{ row }">
        {{ formatCell(f.field_type, row.original[f.key]) }}
      </template>
      <template #__actions-cell="{ row }">
        <div class="flex justify-end gap-1">
          <UButton size="xs" variant="ghost" icon="i-lucide-pencil" aria-label="Edit" @click="openEdit(row.original)" />
          <UButton size="xs" variant="ghost" color="error" icon="i-lucide-trash-2" aria-label="Delete" @click="onDelete(row.original)" />
        </div>
      </template>
      <template #empty>
        <div class="py-8 text-center text-sm text-muted">No records yet.</div>
      </template>
    </UTable>
    <CrmEngineRecordSlideover v-model:open="slideoverOpen" :fields="fields" :client-id="clientId" :record="editing" @save="onSave" />
  </div>
</template>
