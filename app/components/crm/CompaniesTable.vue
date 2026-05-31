<script setup lang="ts">
import type { CrmCompany } from '~/types/crm'

const props = defineProps<{ clientId: string }>()
const clientId = toRef(props, 'clientId')
const { data, pending, search, create, update, remove } = useCrmCompanies(clientId)
const toast = useToast()

const slideoverOpen = ref(false)
const editing = ref<CrmCompany | null>(null)
const fieldsOpen = ref(false)

const columns = [
  { accessorKey: 'name', header: 'Name' },
  { accessorKey: 'domain', header: 'Domain' },
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

    <UTable :data="data?.items ?? []" :columns="columns" :loading="pending">
      <template #name-cell="{ row }">
        <button class="font-medium text-highlighted hover:underline" @click="openEdit(row.original)">
          {{ row.original.name }}
        </button>
      </template>
      <template #domain-cell="{ row }">
        <span class="text-muted">{{ row.original.domain || '—' }}</span>
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
