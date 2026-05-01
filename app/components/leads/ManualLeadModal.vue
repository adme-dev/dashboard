<script setup lang="ts">
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ (e: 'created'): void }>()

const toast = useToast()
// /api/agency/clients returns a plain array, not { items: [] }
const { data: clients } = useFetch<{ id: string; name: string }[]>('/api/agency/clients', {
  default: () => [],
})

const clientId = ref<string | null>(null)
const formName = ref<string>('')
const fields = ref<{ key: string; value: string }[]>([
  { key: 'full_name', value: '' },
  { key: 'email', value: '' },
  { key: 'phone_number', value: '' },
])
const runRules = ref(false)
const saving = ref(false)

const clientOptions = computed(() =>
  ((clients.value ?? []) as { id: string; name: string }[]).map(c => ({ value: c.id, label: c.name })),
)

function addField() { fields.value.push({ key: '', value: '' }) }
function removeField(i: number) { fields.value.splice(i, 1) }

function reset() {
  clientId.value = null
  formName.value = ''
  fields.value = [
    { key: 'full_name', value: '' },
    { key: 'email', value: '' },
    { key: 'phone_number', value: '' },
  ]
  runRules.value = false
}

async function submit() {
  if (!clientId.value) {
    toast.add({ title: 'Pick a client', color: 'error' }); return
  }
  const field_data: Record<string, string> = {}
  for (const f of fields.value) if (f.key && f.value) field_data[f.key] = f.value
  if (!Object.keys(field_data).length) {
    toast.add({ title: 'Add at least one field', color: 'error' }); return
  }
  saving.value = true
  try {
    await $fetch('/api/leads', {
      method: 'POST',
      body: {
        client_id: clientId.value,
        field_data,
        form_name: formName.value || null,
        run_rules: runRules.value,
      },
    })
    toast.add({ title: 'Lead added', color: 'success' })
    reset()
    open.value = false
    emit('created')
  } catch (e: any) {
    toast.add({ title: 'Failed', description: e?.data?.statusMessage ?? '', color: 'error' })
  } finally { saving.value = false }
}
</script>

<template>
  <UModal v-model:open="open">
    <template #content>
      <div class="p-6 space-y-4 w-full max-w-xl">
        <h3 class="text-base font-semibold">New manual lead</h3>

        <div class="space-y-2">
          <label class="text-xs text-muted">Client</label>
          <USelectMenu v-model="clientId" :items="clientOptions" value-key="value" placeholder="Pick a client" />
        </div>

        <div class="space-y-2">
          <label class="text-xs text-muted">Form name (optional)</label>
          <UInput v-model="formName" placeholder="e.g. Phone-In, Walk-in" />
        </div>

        <div class="space-y-2">
          <label class="text-xs text-muted">Fields</label>
          <div v-for="(f, i) in fields" :key="i" class="flex items-center gap-2">
            <UInput v-model="f.key" placeholder="key" class="w-40" />
            <UInput v-model="f.value" placeholder="value" class="flex-1" />
            <UButton icon="i-lucide-x" variant="ghost" size="sm" @click="removeField(i)" />
          </div>
          <UButton icon="i-lucide-plus" variant="ghost" size="sm" @click="addField">Add field</UButton>
        </div>

        <UCheckbox v-model="runRules" label="Run rules engine for this lead (otherwise skip fan-out)" />

        <div class="flex justify-end gap-2 pt-2 border-t border-default">
          <UButton variant="ghost" @click="open = false">Cancel</UButton>
          <UButton :loading="saving" color="primary" @click="submit">Add lead</UButton>
        </div>
      </div>
    </template>
  </UModal>
</template>
