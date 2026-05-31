<script setup lang="ts">
// Built with the frontend-design principles applied as disciplined consistency with the
// existing Nuxt UI v4 system: UFormField rhythm, 2-col grid, semantic tokens, clear hierarchy.
const props = defineProps<{
  objectType: 'person' | 'company'
  clientId: string
  record: Record<string, any> | null
}>()
const emit = defineEmits<{ submit: [Record<string, unknown>], cancel: [] }>()

const clientId = toRef(props, 'clientId')
const { fields } = useCrmCustomFields(clientId, props.objectType)

const PERSON_FIELDS = [
  { key: 'first_name', label: 'First name', required: true },
  { key: 'last_name', label: 'Last name' },
  { key: 'email', label: 'Email' },
  { key: 'phone', label: 'Phone' },
  { key: 'mobile', label: 'Mobile' },
  { key: 'job_title', label: 'Job title' },
  { key: 'department', label: 'Department' },
  { key: 'city', label: 'City' },
]
const COMPANY_FIELDS = [
  { key: 'name', label: 'Name', required: true },
  { key: 'domain', label: 'Domain' },
  { key: 'phone', label: 'Phone' },
  { key: 'employees', label: 'Employees' },
  { key: 'address_line1', label: 'Address' },
  { key: 'city', label: 'City' },
  { key: 'state', label: 'State' },
  { key: 'postal_code', label: 'Postcode' },
]
const builtins = computed(() => props.objectType === 'person' ? PERSON_FIELDS : COMPANY_FIELDS)

const form = reactive<Record<string, any>>({})
const custom = reactive<Record<string, any>>({})
const errors = ref<Record<string, string>>({})

watchEffect(() => {
  for (const f of builtins.value) form[f.key] = props.record?.[f.key] ?? ''
  for (const cf of fields.value) custom[cf.key] = (props.record?.custom_fields ?? {})[cf.key] ?? ''
})

const loading = ref(false)
function submit() {
  errors.value = {}
  for (const f of builtins.value) {
    if (f.required && !String(form[f.key] ?? '').trim()) errors.value[f.key] = `${f.label} is required`
  }
  if (Object.keys(errors.value).length) return
  loading.value = true
  try {
    const body: Record<string, unknown> = { ...form, custom_fields: { ...custom } }
    if (body.employees === '' || body.employees == null) delete body.employees
    emit('submit', body)
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <form class="space-y-5" @submit.prevent="submit">
    <div class="grid grid-cols-2 gap-4">
      <UFormField
        v-for="f in builtins"
        :key="f.key"
        :label="f.label"
        :error="errors[f.key]"
        :required="f.required"
      >
        <UInput
          v-model="form[f.key]"
          :type="f.key === 'employees' ? 'number' : (f.key === 'email' ? 'email' : 'text')"
        />
      </UFormField>
    </div>

    <template v-if="fields.length">
      <div class="flex items-center gap-2 pt-1">
        <USeparator class="flex-1" />
        <span class="text-xs font-medium text-muted uppercase tracking-wide">Custom fields</span>
        <USeparator class="flex-1" />
      </div>
      <div class="grid grid-cols-2 gap-4">
        <UFormField v-for="cf in fields" :key="cf.id" :label="cf.label">
          <USelectMenu
            v-if="cf.field_type === 'dropdown' || cf.field_type === 'status'"
            v-model="custom[cf.key]"
            :items="cf.options"
          />
          <UCheckbox v-else-if="cf.field_type === 'checkbox'" v-model="custom[cf.key]" />
          <UInput
            v-else
            v-model="custom[cf.key]"
            :type="cf.field_type === 'number' || cf.field_type === 'currency' ? 'number' : 'text'"
          />
        </UFormField>
      </div>
    </template>

    <div class="flex justify-end gap-2 pt-2">
      <UButton type="button" variant="ghost" color="neutral" @click="emit('cancel')">Cancel</UButton>
      <UButton type="submit" :loading="loading">{{ record ? 'Save' : 'Create' }}</UButton>
    </div>
  </form>
</template>
