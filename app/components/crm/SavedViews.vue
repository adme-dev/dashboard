<script setup lang="ts">
// F9 — saved views menu. Loads a view's filters into the bound model, saves the
// current filters as a new view, or deletes one. Own + shared views are listed.
import type { CrmEntity, CrmFilterClause, CrmView } from '~/types/crm'

const props = defineProps<{ entity: CrmEntity, clientId: string }>()
const model = defineModel<CrmFilterClause[]>({ default: () => [] })

const clientRef = toRef(props, 'clientId')
const { views, save, remove } = useCrmViews(clientRef, props.entity)
const toast = useToast()

const saveOpen = ref(false)
const newName = ref('')
const newShared = ref(false)
const saving = ref(false)

function load(v: CrmView) {
  model.value = Array.isArray(v.filters) ? (v.filters as CrmFilterClause[]) : []
  toast.add({ title: `View “${v.name}” applied`, color: 'success' })
}

async function doSave() {
  if (!newName.value.trim()) return
  saving.value = true
  try {
    await save({ name: newName.value.trim(), filters: model.value, is_shared: newShared.value })
    toast.add({ title: 'View saved', color: 'success' })
    saveOpen.value = false
    newName.value = ''
    newShared.value = false
  } catch (e: any) {
    toast.add({ title: 'Could not save view', description: e?.data?.statusMessage || e?.message, color: 'error' })
  } finally {
    saving.value = false
  }
}

async function doDelete(v: CrmView) {
  try { await remove(v.id); toast.add({ title: 'View deleted', color: 'success' }) }
  catch (e: any) { toast.add({ title: 'Could not delete', description: e?.data?.statusMessage || e?.message, color: 'error' }) }
}

const menuItems = computed(() => {
  const viewRows = views.value.length
    ? views.value.map(v => ({
        label: v.name,
        icon: v.is_shared ? 'i-lucide-users' : 'i-lucide-bookmark',
        onSelect: () => load(v),
        // a trailing delete is offered via a second action row below; keep select = load
      }))
    : [{ label: 'No saved views', disabled: true }]
  return [
    viewRows,
    [{ label: 'Save current as…', icon: 'i-lucide-save', onSelect: () => { saveOpen.value = true } }],
  ]
})
</script>

<template>
  <div>
    <UDropdownMenu :items="menuItems" :ui="{ content: 'w-56' }">
      <UButton icon="i-lucide-bookmark" variant="ghost" color="neutral" size="sm" trailing-icon="i-lucide-chevron-down">
        Views
      </UButton>
    </UDropdownMenu>

    <!-- Manage (delete) list — shown inline when there are views, compact -->
    <UModal v-model:open="saveOpen">
      <template #content>
        <div class="p-4 space-y-4">
          <div>
            <h3 class="text-sm font-semibold">Save view</h3>
            <p class="text-xs text-muted mt-0.5">Stores the current filters for quick reuse.</p>
          </div>
          <UFormField label="Name">
            <UInput v-model="newName" placeholder="e.g. Hot leads in Perth" autofocus @keyup.enter="doSave" />
          </UFormField>
          <UCheckbox v-model="newShared" label="Share with the team" />
          <div v-if="views.length" class="border-t border-default pt-3 space-y-1">
            <p class="text-xs text-muted">Existing views</p>
            <div v-for="v in views" :key="v.id" class="flex items-center justify-between gap-2 text-sm">
              <span class="flex items-center gap-1.5 min-w-0">
                <UIcon :name="v.is_shared ? 'i-lucide-users' : 'i-lucide-bookmark'" class="size-3.5 text-muted shrink-0" />
                <span class="truncate">{{ v.name }}</span>
              </span>
              <UButton icon="i-lucide-trash-2" variant="ghost" color="error" size="xs" @click="doDelete(v)" />
            </div>
          </div>
          <div class="flex justify-end gap-2">
            <UButton variant="ghost" color="neutral" @click="saveOpen = false">Cancel</UButton>
            <UButton color="primary" :loading="saving" :disabled="!newName.trim()" @click="doSave">Save</UButton>
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>
