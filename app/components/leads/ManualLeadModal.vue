<script setup lang="ts">
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ (e: 'created'): void }>()

const toast = useToast()
const apiFetch = $fetch as <T = unknown>(
  request: string,
  options?: { method?: string, body?: unknown }
) => Promise<T>
const clients = ref<{ id: string, name: string }[]>([])

async function refreshClients() {
  clients.value = await apiFetch<{ id: string, name: string }[]>('/api/agency/clients')
}

await refreshClients()

const clientId = ref<string | null>(null)
const formName = ref<string>('')

// Standard fields are always visible with friendly labels — marketers don't
// think in snake_case. Keys are stable so the lead schema stays consistent.
interface FixedField { label: string, key: string, value: string, placeholder: string, type?: string }
const fixedFields = ref<FixedField[]>([
  { label: 'Full name', key: 'full_name', value: '', placeholder: 'e.g. Sarah Mitchell' },
  { label: 'Email', key: 'email', value: '', placeholder: 'sarah@example.com', type: 'email' },
  { label: 'Phone', key: 'phone_number', value: '', placeholder: '+61 4xx xxx xxx', type: 'tel' }
])

// Custom fields — user provides any label, we auto-derive the storage key.
const customFields = ref<{ label: string, value: string }[]>([])
const runRules = ref(false)
const saving = ref(false)
const errors = ref<{ client?: string, fields?: string }>({})

const clientOptions = computed(() =>
  ((clients.value ?? []) as { id: string, name: string }[]).map(c => ({ value: c.id, label: c.name }))
)

function deriveKey(label: string): string {
  return label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'field'
}

function addCustomField() {
  customFields.value.push({ label: '', value: '' })
}

function removeCustomField(i: number) {
  customFields.value.splice(i, 1)
}

function reset() {
  clientId.value = null
  formName.value = ''
  fixedFields.value.forEach(f => f.value = '')
  customFields.value = []
  runRules.value = false
  errors.value = {}
}

async function submit() {
  errors.value = {}
  if (!clientId.value) {
    errors.value.client = 'Pick a client before adding this lead.'
    toast.add({ title: 'Pick a client first', color: 'error' })
    return
  }
  const field_data: Record<string, string> = {}
  for (const f of fixedFields.value) {
    if (f.value.trim()) field_data[f.key] = f.value.trim()
  }
  for (const f of customFields.value) {
    const label = f.label.trim()
    const value = f.value.trim()
    if (!label || !value) continue
    field_data[deriveKey(label)] = value
  }
  if (!Object.keys(field_data).length) {
    errors.value.fields = 'Fill in at least one lead detail.'
    toast.add({ title: 'Fill in at least one field', color: 'error' })
    return
  }
  saving.value = true
  try {
    await apiFetch('/api/leads', {
      method: 'POST',
      body: {
        client_id: clientId.value,
        field_data,
        form_name: formName.value || null,
        run_rules: runRules.value
      }
    })
    toast.add({ title: 'Lead added', color: 'success' })
    reset()
    open.value = false
    emit('created')
  } catch (e: unknown) {
    const description = e && typeof e === 'object' && 'data' in e
      ? (e as { data?: { statusMessage?: string } }).data?.statusMessage
      : ''
    toast.add({ title: 'Failed to add lead', description: description ?? '', color: 'error' })
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <UModal v-model:open="open" :ui="{ content: 'max-w-xl' }">
    <template #content>
      <div class="p-6 space-y-5">
        <div>
          <h3 class="text-lg font-semibold">
            New manual lead
          </h3>
          <p class="text-sm text-muted mt-0.5">
            For phone calls, walk-ins, or leads from outside the dashboard.
          </p>
        </div>

        <UFormField label="Client" required :error="errors.client">
          <USelectMenu
            v-model="clientId"
            :items="clientOptions"
            value-key="value"
            placeholder="Pick a client"
            class="w-full"
          />
        </UFormField>

        <UFormField label="Form name" hint="Optional — for tracking the source">
          <UInput
            v-model="formName"
            placeholder="e.g. Phone-In, Walk-in, Trade Show"
            class="w-full"
          />
        </UFormField>

        <div>
          <label class="block text-sm font-medium mb-2">Lead details</label>
          <div class="space-y-3">
            <UFormField
              v-for="f in fixedFields"
              :key="f.key"
              :label="f.label"
              size="sm"
            >
              <UInput
                v-model="f.value"
                :placeholder="f.placeholder"
                :type="f.type ?? 'text'"
                class="w-full"
              />
            </UFormField>

            <div v-if="customFields.length" class="pt-2 border-t border-default space-y-3">
              <p class="text-xs uppercase font-semibold text-muted tracking-wide">
                Custom fields
              </p>
              <div
                v-for="(row, i) in customFields"
                :key="i"
                class="grid grid-cols-[1fr_1fr_auto] gap-2 items-start"
              >
                <UInput v-model="row.label" placeholder="Field name (e.g. Budget)" />
                <UInput v-model="row.value" placeholder="Value" />
                <UButton
                  icon="i-lucide-x"
                  variant="ghost"
                  color="neutral"
                  size="sm"
                  aria-label="Remove custom field"
                  @click="removeCustomField(i)"
                />
              </div>
            </div>
          </div>
          <p v-if="errors.fields" class="mt-2 text-sm text-error">
            {{ errors.fields }}
          </p>

          <UButton
            icon="i-lucide-plus"
            variant="ghost"
            size="sm"
            color="primary"
            class="mt-2 -ml-2"
            @click="addCustomField"
          >
            Add custom field
          </UButton>
        </div>

        <UCheckbox
          v-model="runRules"
          label="Run routing rules for this lead"
          help="Off by default — manual leads usually skip Slack/email fan-out."
        />

        <div class="flex justify-end gap-2 pt-4 border-t border-default">
          <UButton variant="ghost" color="neutral" @click="open = false">
            Cancel
          </UButton>
          <UButton
            :loading="saving"
            color="primary"
            icon="i-lucide-check"
            @click="submit"
          >
            Add lead
          </UButton>
        </div>
      </div>
    </template>
  </UModal>
</template>
