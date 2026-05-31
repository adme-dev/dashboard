<script setup lang="ts">
// frontend-design principles applied as consistency with the dashboard system:
// UFormField rhythm, 2-col grid, semantic tokens, clear hierarchy.
import type { CrmOpportunity, CrmStage, CrmPerson, CrmCompany } from '~/types/crm'

const props = defineProps<{ clientId: string, record: CrmOpportunity | null, stages: CrmStage[] }>()
const emit = defineEmits<{ submit: [Record<string, unknown>], cancel: [] }>()
const clientId = toRef(props, 'clientId')
const base = inject<string>('crmApiBase', '/api/crm')

const peopleQuery = computed(() => ({ client_id: clientId.value, page_size: '200' }))
const companiesQuery = computed(() => ({ client_id: clientId.value, page_size: '200' }))
const { data: peopleData } = useFetch<{ items: CrmPerson[] }>(`${base}/people`, { query: peopleQuery, watch: [peopleQuery] })
const { data: companiesData } = useFetch<{ items: CrmCompany[] }>(`${base}/companies`, { query: companiesQuery, watch: [companiesQuery] })
const personItems = computed(() => (peopleData.value?.items ?? []).map(p => ({ label: [p.first_name, p.last_name].filter(Boolean).join(' '), value: p.id })))
const companyItems = computed(() => (companiesData.value?.items ?? []).map(c => ({ label: c.name, value: c.id })))
const stageItems = computed(() => props.stages.map(s => ({ label: s.name, value: s.id })))

const form = reactive({
  name: props.record?.name ?? '',
  stage_id: props.record?.stage_id ?? (props.stages[0]?.id ?? ''),
  amount: props.record?.amount ?? 0,
  person_id: props.record?.person_id ?? null,
  company_id: props.record?.company_id ?? null,
  notes: props.record?.notes ?? '',
})
const errors = ref<Record<string, string>>({})
const loading = ref(false)

function submit() {
  errors.value = {}
  if (!form.name.trim()) errors.value.name = 'Name is required'
  if (!form.stage_id) errors.value.stage_id = 'Stage is required'
  if (Object.keys(errors.value).length) return
  loading.value = true
  try { emit('submit', { ...form }) }
  finally { loading.value = false }
}
</script>

<template>
  <form class="space-y-4" @submit.prevent="submit">
    <UFormField label="Name" :error="errors.name" required>
      <UInput v-model="form.name" placeholder="Acme renewal" />
    </UFormField>
    <div class="grid grid-cols-2 gap-4">
      <UFormField label="Stage" :error="errors.stage_id" required>
        <USelectMenu v-model="form.stage_id" :items="stageItems" value-key="value" />
      </UFormField>
      <UFormField label="Amount">
        <UInput v-model.number="form.amount" type="number" min="0">
          <template #leading><span class="text-muted">$</span></template>
        </UInput>
      </UFormField>
      <UFormField label="Company">
        <USelectMenu v-model="form.company_id" :items="companyItems" value-key="value" placeholder="—" />
      </UFormField>
      <UFormField label="Contact">
        <USelectMenu v-model="form.person_id" :items="personItems" value-key="value" placeholder="—" />
      </UFormField>
    </div>
    <UFormField label="Notes">
      <UTextarea v-model="form.notes" :rows="4" class="w-full" />
    </UFormField>
    <div class="flex justify-end gap-2 pt-2">
      <UButton type="button" variant="ghost" color="neutral" @click="emit('cancel')">Cancel</UButton>
      <UButton type="submit" :loading="loading">{{ record ? 'Save' : 'Create' }}</UButton>
    </div>
  </form>
</template>
