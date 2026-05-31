<script setup lang="ts">
const props = defineProps<{ open: boolean, objectType: 'person' | 'company', clientId: string }>()
const emit = defineEmits<{ 'update:open': [boolean] }>()

const clientId = toRef(props, 'clientId')
const { fields, create, remove } = useCrmCustomFields(clientId, props.objectType)
const toast = useToast()

const TYPES = ['text', 'number', 'currency', 'date', 'status', 'dropdown', 'checkbox', 'rating', 'link', 'email', 'phone', 'location', 'tags']
const draft = reactive({ key: '', label: '', field_type: 'text', options: '' })
const saving = ref(false)

const needsOptions = computed(() => draft.field_type === 'dropdown' || draft.field_type === 'status')

async function add() {
  if (!draft.key.trim() || !draft.label.trim()) return
  if (!/^[a-z0-9_]+$/.test(draft.key)) {
    toast.add({ title: 'Invalid key', description: 'Use lowercase letters, numbers and underscores only.', color: 'error' })
    return
  }
  saving.value = true
  try {
    await create({
      key: draft.key,
      label: draft.label,
      field_type: draft.field_type,
      options: draft.options ? draft.options.split(',').map(s => s.trim()).filter(Boolean) : [],
    })
    Object.assign(draft, { key: '', label: '', field_type: 'text', options: '' })
  } catch (e: any) {
    toast.add({ title: 'Could not add field', description: e?.data?.statusMessage || e?.message, color: 'error' })
  } finally {
    saving.value = false
  }
}
async function onRemove(id: string) {
  try { await remove(id) }
  catch (e: any) { toast.add({ title: 'Delete failed', description: e?.data?.statusMessage || e?.message, color: 'error' }) }
}
</script>

<template>
  <UModal
    :open="open"
    :title="`Custom fields — ${objectType === 'person' ? 'People' : 'Companies'}`"
    description="Define extra fields for this client's records."
    @update:open="emit('update:open', $event)"
  >
    <template #body>
      <div class="space-y-4">
        <ul class="divide-y divide-default rounded-lg border border-default">
          <li v-for="f in fields" :key="f.id" class="flex items-center justify-between px-3 py-2">
            <span>
              <span class="font-medium">{{ f.label }}</span>
              <span class="text-xs text-muted ml-1">({{ f.field_type }} · {{ f.key }})</span>
            </span>
            <UButton icon="i-lucide-trash-2" size="xs" variant="ghost" color="error" @click="onRemove(f.id)" />
          </li>
          <li v-if="!fields.length" class="px-3 py-3 text-sm text-muted">No custom fields yet.</li>
        </ul>

        <div class="border-t border-default pt-4 space-y-3">
          <div class="grid grid-cols-2 gap-3">
            <UFormField label="Key"><UInput v-model="draft.key" placeholder="tier" /></UFormField>
            <UFormField label="Label"><UInput v-model="draft.label" placeholder="Tier" /></UFormField>
            <UFormField label="Type"><USelectMenu v-model="draft.field_type" :items="TYPES" /></UFormField>
            <UFormField v-if="needsOptions" label="Options (comma-separated)">
              <UInput v-model="draft.options" placeholder="gold,silver" />
            </UFormField>
          </div>
          <div class="flex justify-end">
            <UButton :loading="saving" :disabled="!draft.key || !draft.label" @click="add">Add field</UButton>
          </div>
        </div>
      </div>
    </template>
  </UModal>
</template>
