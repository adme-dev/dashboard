<script setup lang="ts">
import type { CrmObjectDef } from '~/types/crm'
definePageMeta({ layout: 'agency' })
useHead({ title: 'CRM — XeroFlow Agency' })

// Clients to pick from (reuse the existing agency clients endpoint — returns a bare array).
const { data: clientsData } = await useFetch<{ id: string, name: string }[]>('/api/agency/clients')
const clientOptions = computed(() => (clientsData.value ?? []).map(c => ({ label: c.name, value: c.id })))

const clientId = useState<string | null>('crm-active-client', () => null)
const tab = ref<string>('people')
const tabItems = [
  { label: 'People', value: 'people', icon: 'i-lucide-users' },
  { label: 'Companies', value: 'companies', icon: 'i-lucide-building-2' },
  { label: 'Pipeline', value: 'pipeline', icon: 'i-lucide-trello' },
]

// Custom config objects for the active client + the verticals that drive the designer.
const { objects } = useCrmObjectDefs(clientId)
const { data: verticalsData } = await useFetch<{ enabled: string[] }>('/api/crm/verticals', {
  query: computed(() => ({ client_id: clientId.value ?? '' })),
  watch: [clientId],
  default: () => ({ enabled: ['generic'] }),
})
const configVerticals = computed(() => (verticalsData.value?.enabled ?? []).filter(v => v !== 'generic'))

const allTabs = computed(() => [
  ...tabItems,
  ...objects.value.map(o => ({ label: o.label_plural, value: `obj:${o.key}`, icon: o.icon || 'i-lucide-box' })),
  { label: 'Custom Objects', value: 'designer', icon: 'i-lucide-settings-2' },
])
const activeObject = computed<CrmObjectDef | null>(() =>
  tab.value.startsWith('obj:') ? (objects.value.find(o => `obj:${o.key}` === tab.value) ?? null) : null,
)
// Reset to a core tab when the client changes — a config-object tab may not exist for the new client.
watch(clientId, () => { tab.value = 'people' })
</script>

<template>
  <div class="p-6 space-y-5">
    <div class="flex items-end justify-between gap-4">
      <div>
        <h1 class="text-2xl font-bold tracking-tight">CRM</h1>
        <p class="text-sm text-muted mt-0.5">Manage a client's contacts and companies.</p>
      </div>
      <UFormField label="Client" class="w-64">
        <USelectMenu
          v-model="clientId"
          :items="clientOptions"
          value-key="value"
          placeholder="Select a client"
          icon="i-lucide-briefcase"
        />
      </UFormField>
    </div>

    <div
      v-if="!clientId"
      class="border border-dashed border-default rounded-xl p-12 text-center text-muted"
    >
      <UIcon name="i-lucide-contact" class="size-8 mx-auto mb-3 opacity-60" />
      <p class="text-sm">Select a client above to view and manage their CRM.</p>
    </div>

    <template v-else>
      <UTabs v-model="tab" :items="allTabs" class="w-full" />
      <CrmPeopleTable v-if="tab === 'people'" :client-id="clientId" />
      <CrmCompaniesTable v-else-if="tab === 'companies'" :client-id="clientId" />
      <CrmPipelineBoard v-else-if="tab === 'pipeline'" :client-id="clientId" />
      <template v-else-if="tab === 'designer'">
        <div v-if="!configVerticals.length" class="text-sm text-muted">
          Assign a config vertical to this client to define custom objects.
        </div>
        <div v-for="vk in configVerticals" :key="vk" class="space-y-2">
          <h3 class="text-sm font-semibold capitalize">{{ vk }}</h3>
          <CrmObjectDefManager :client-id="clientId" :vertical-key="vk" />
        </div>
      </template>
      <template v-else-if="activeObject">
        <CrmEnginePipelineBoard v-if="activeObject.has_pipeline" :client-id="clientId" :object-key="activeObject.key" />
        <CrmEngineRecordsTable v-else :client-id="clientId" :object-key="activeObject.key" />
      </template>
    </template>
  </div>
</template>
