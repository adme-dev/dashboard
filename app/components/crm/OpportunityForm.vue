<script setup lang="ts">
// frontend-design principles applied as consistency with the dashboard system:
// UFormField rhythm, container-aware grid, semantic tokens, clear hierarchy.
import type { CrmOpportunity, CrmStage, CrmPerson, CrmCompany } from '~/types/crm'

const props = defineProps<{ clientId: string, record: CrmOpportunity | null, stages: CrmStage[] }>()
const emit = defineEmits<{ submit: [Record<string, unknown>], cancel: [] }>()
const clientId = toRef(props, 'clientId')
const base = inject<string>('crmApiBase', '/api/crm')
const apiFetch = $fetch as <T = unknown>(request: string, options?: { query?: Record<string, unknown> }) => Promise<T>

const peopleQuery = computed(() => ({ client_id: clientId.value, page_size: '200' }))
const companiesQuery = computed(() => ({ client_id: clientId.value, page_size: '200' }))
const peopleData = ref<{ items: CrmPerson[] }>({ items: [] })
const companiesData = ref<{ items: CrmCompany[] }>({ items: [] })

async function refreshPeople() {
  peopleData.value = await apiFetch<{ items: CrmPerson[] }>(`${base}/people`, { query: peopleQuery.value })
}

async function refreshCompanies() {
  companiesData.value = await apiFetch<{ items: CrmCompany[] }>(`${base}/companies`, { query: companiesQuery.value })
}

watch(peopleQuery, () => {
  refreshPeople()
}, { immediate: true })

watch(companiesQuery, () => {
  refreshCompanies()
}, { immediate: true })

const personItems = computed(() => (peopleData.value?.items ?? []).map(p => ({ label: [p.first_name, p.last_name].filter(Boolean).join(' '), value: p.id })))
const companyItems = computed(() => (companiesData.value?.items ?? []).map(c => ({ label: c.name, value: c.id })))
const stageItems = computed(() => props.stages.map(s => ({ label: s.name, value: s.id })))

const form = reactive({
  name: props.record?.name ?? '',
  stage_id: props.record?.stage_id ?? (props.stages[0]?.id ?? ''),
  amount: props.record?.amount ?? 0,
  person_id: props.record?.person_id ?? null,
  company_id: props.record?.company_id ?? null,
  owner_id: props.record?.owner_id ?? null,
  notes: props.record?.notes ?? ''
})
const errors = ref<Record<string, string>>({})
const loading = ref(false)

function submit() {
  errors.value = {}
  if (!form.name.trim()) errors.value.name = 'Name is required'
  if (!form.stage_id) errors.value.stage_id = 'Stage is required'
  if (Object.keys(errors.value).length) return
  loading.value = true
  try {
    emit('submit', { ...form })
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <form class="@container space-y-5" @submit.prevent="submit">
    <UFormField label="Name" :error="errors.name" required>
      <UInput
        v-model="form.name"
        placeholder="Acme renewal"
        class="w-full"
      />
    </UFormField>
    <div class="grid grid-cols-1 gap-4 @lg:grid-cols-2">
      <UFormField label="Stage" :error="errors.stage_id" required>
        <USelectMenu
          v-model="form.stage_id"
          :items="stageItems"
          value-key="value"
          class="w-full"
        />
      </UFormField>
      <UFormField label="Amount">
        <UInput
          v-model.number="form.amount"
          type="number"
          min="0"
          class="w-full"
        >
          <template #leading>
            <span class="text-muted">$</span>
          </template>
        </UInput>
      </UFormField>
      <UFormField label="Company">
        <USelectMenu
          v-model="form.company_id"
          :items="companyItems"
          value-key="value"
          placeholder="—"
          class="w-full"
        />
      </UFormField>
      <UFormField label="Contact">
        <USelectMenu
          v-model="form.person_id"
          :items="personItems"
          value-key="value"
          placeholder="—"
          class="w-full"
        />
      </UFormField>
      <UFormField label="Owner" class="@lg:col-span-2">
        <CrmOwnerSelect v-model="form.owner_id" />
      </UFormField>
    </div>
    <UFormField label="Notes">
      <UTextarea v-model="form.notes" :rows="4" class="w-full" />
    </UFormField>
    <div class="flex justify-end gap-2 pt-2">
      <UButton
        type="button"
        variant="ghost"
        color="neutral"
        @click="emit('cancel')"
      >
        Cancel
      </UButton>
      <UButton type="submit" :loading="loading">
        {{ record ? 'Save' : 'Create' }}
      </UButton>
    </div>
  </form>
</template>
