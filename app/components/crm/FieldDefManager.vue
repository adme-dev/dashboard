<script setup lang="ts">
// Field designer for one config object. Lists existing fields and adds new ones,
// modeled on the shipped CustomFieldsManager but extended for the engine's wider
// type list + relation targets + title/required flags.
const props = defineProps<{ clientId: string, objectDefId: string }>()
const clientId = toRef(props, 'clientId')
const objectDefId = toRef(props, 'objectDefId')
const { fields, create, remove } = useCrmFieldDefs(clientId, objectDefId)
const toast = useToast()

const TYPES = ['text', 'long_text', 'number', 'currency', 'date', 'status', 'dropdown', 'checkbox', 'rating', 'link', 'email', 'phone', 'location', 'tags', 'relation']
const draft = reactive({ key: '', label: '', field_type: 'text', options: '', relation_target: 'person', is_required: false, is_title: false })
const saving = ref(false)
const needsOptions = computed(() => draft.field_type === 'dropdown' || draft.field_type === 'status')
const isRelation = computed(() => draft.field_type === 'relation')

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
      options: needsOptions.value && draft.options ? draft.options.split(',').map(s => s.trim()).filter(Boolean) : [],
      relation_target: isRelation.value ? (draft.relation_target as 'person' | 'company') : null,
      is_required: draft.is_required,
      is_title: draft.is_title,
    })
    Object.assign(draft, { key: '', label: '', field_type: 'text', options: '', relation_target: 'person', is_required: false, is_title: false })
  } catch (e: any) {
    toast.add({ title: 'Could not add field', description: e?.data?.statusMessage || e?.message, color: 'error' })
  } finally { saving.value = false }
}
async function onRemove(id: string) {
  try { await remove(id) }
  catch (e: any) { toast.add({ title: 'Delete failed', description: e?.data?.statusMessage || e?.message, color: 'error' }) }
}
</script>

<template>
  <div class="space-y-5">
    <ul class="divide-y divide-default rounded-lg border border-default overflow-hidden">
      <li
        v-for="f in fields"
        :key="f.id"
        class="flex items-center justify-between gap-3 px-3.5 py-2.5 hover:bg-elevated/40 transition-colors"
      >
        <div class="min-w-0">
          <div class="flex items-center gap-2">
            <span class="font-medium truncate">{{ f.label }}</span>
            <UBadge v-if="f.is_title" size="xs" color="primary" variant="subtle">title</UBadge>
            <UBadge v-if="f.is_required" size="xs" color="warning" variant="subtle">required</UBadge>
          </div>
          <p class="text-xs text-muted mt-0.5 font-mono">
            {{ f.field_type }}<template v-if="f.relation_target"> → {{ f.relation_target }}</template> · {{ f.key }}
          </p>
        </div>
        <UButton icon="i-lucide-trash-2" size="xs" variant="ghost" color="error" aria-label="Delete field" @click="onRemove(f.id)" />
      </li>
      <li v-if="!fields.length" class="px-3.5 py-6 text-center text-sm text-muted">
        No fields yet — add the first one below.
      </li>
    </ul>

    <div class="border-t border-default pt-4 space-y-4">
      <div class="grid grid-cols-2 gap-4">
        <UFormField label="Key" help="machine name, e.g. sku">
          <UInput v-model="draft.key" placeholder="sku" />
        </UFormField>
        <UFormField label="Label">
          <UInput v-model="draft.label" placeholder="SKU" />
        </UFormField>
        <UFormField label="Type">
          <USelectMenu v-model="draft.field_type" :items="TYPES" />
        </UFormField>
        <UFormField v-if="needsOptions" label="Options" help="comma-separated">
          <UInput v-model="draft.options" placeholder="gold, silver, bronze" />
        </UFormField>
        <UFormField v-if="isRelation" label="Relates to">
          <USelectMenu v-model="draft.relation_target" :items="['person', 'company']" />
        </UFormField>
      </div>
      <div class="flex items-center gap-5">
        <UCheckbox v-model="draft.is_title" label="Title field" />
        <UCheckbox v-model="draft.is_required" label="Required" />
        <UButton class="ml-auto" :loading="saving" :disabled="!draft.key || !draft.label" @click="add">
          Add field
        </UButton>
      </div>
    </div>
  </div>
</template>
