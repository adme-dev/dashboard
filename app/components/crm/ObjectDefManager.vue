<script setup lang="ts">
// Object designer for a config vertical: lists the vertical's objects (expandable to
// reveal their FieldDefManager) and adds new objects.
const props = defineProps<{ clientId: string, verticalKey: string }>()
const clientId = toRef(props, 'clientId')
const { objects, create, remove } = useCrmObjectDefs(clientId)
const toast = useToast()

const verticalObjects = computed(() => objects.value.filter(o => o.vertical_key === props.verticalKey))
const draft = reactive({ key: '', label: '', label_plural: '', icon: 'i-lucide-box', has_pipeline: false })
const saving = ref(false)
const expanded = ref<string | null>(null)

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
      label_plural: draft.label_plural || draft.label + 's',
      icon: draft.icon,
      has_pipeline: draft.has_pipeline,
      vertical_key: props.verticalKey,
    } as any)
    Object.assign(draft, { key: '', label: '', label_plural: '', icon: 'i-lucide-box', has_pipeline: false })
  } catch (e: any) {
    toast.add({ title: 'Could not add object', description: e?.data?.statusMessage || e?.message, color: 'error' })
  } finally { saving.value = false }
}
async function onRemove(id: string) {
  try { await remove(id) }
  catch (e: any) { toast.add({ title: 'Delete failed', description: e?.data?.statusMessage || e?.message, color: 'error' }) }
}
</script>

<template>
  <div class="space-y-5">
    <div v-for="o in verticalObjects" :key="o.id" class="rounded-xl border border-default overflow-hidden">
      <div class="flex items-center justify-between gap-3 px-4 py-3 bg-elevated/30">
        <div class="flex items-center gap-2.5 min-w-0">
          <UIcon :name="o.icon || 'i-lucide-box'" class="size-4 text-muted shrink-0" />
          <span class="font-medium truncate">{{ o.label_plural }}</span>
          <span class="text-xs text-muted font-mono">{{ o.key }}</span>
          <UBadge v-if="o.has_pipeline" size="xs" variant="subtle" color="primary">pipeline</UBadge>
        </div>
        <div class="flex items-center gap-1 shrink-0">
          <UButton
            size="xs"
            variant="ghost"
            :icon="expanded === o.id ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
            :label="expanded === o.id ? 'Hide fields' : 'Fields'"
            @click="expanded = expanded === o.id ? null : o.id"
          />
          <UButton size="xs" variant="ghost" color="error" icon="i-lucide-trash-2" aria-label="Delete object" @click="onRemove(o.id)" />
        </div>
      </div>
      <div v-if="expanded === o.id" class="border-t border-default p-4">
        <CrmFieldDefManager :client-id="clientId" :object-def-id="o.id" />
      </div>
    </div>

    <p v-if="!verticalObjects.length" class="text-sm text-muted px-1">
      No objects defined for this vertical yet — create one below.
    </p>

    <div class="border-t border-default pt-4 space-y-4">
      <div class="grid grid-cols-2 gap-4">
        <UFormField label="Key" help="machine name, e.g. product">
          <UInput v-model="draft.key" placeholder="product" />
        </UFormField>
        <UFormField label="Label">
          <UInput v-model="draft.label" placeholder="Product" />
        </UFormField>
        <UFormField label="Plural">
          <UInput v-model="draft.label_plural" placeholder="Products" />
        </UFormField>
        <UFormField label="Icon" help="lucide name">
          <UInput v-model="draft.icon" placeholder="i-lucide-package" />
        </UFormField>
      </div>
      <div class="flex items-center gap-5">
        <UCheckbox v-model="draft.has_pipeline" label="Has pipeline" />
        <UButton class="ml-auto" :loading="saving" :disabled="!draft.key || !draft.label" @click="add">
          Add object
        </UButton>
      </div>
    </div>
  </div>
</template>
