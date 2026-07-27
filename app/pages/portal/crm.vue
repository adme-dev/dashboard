<script setup lang="ts">
import type { CrmObjectDef } from '~/types/crm'
definePageMeta({ layout: 'portal', middleware: 'portal-auth' })
useHead({ title: 'CRM — Client Portal' })

// All CRM composables read inject('crmApiBase'); point them at the session-scoped portal API.
provide('crmApiBase', '/api/client-portal/crm')

const { user } = usePortalAuth()
const clientId = computed(() => user.value?.clientId ?? null)

const tab = ref<string>('people')
const tabItems = [
  { label: 'People', value: 'people', icon: 'i-lucide-users' },
  { label: 'Companies', value: 'companies', icon: 'i-lucide-building-2' },
  { label: 'Pipeline', value: 'pipeline', icon: 'i-lucide-trello' },
  { label: 'Tasks', value: 'tasks', icon: 'i-lucide-list-checks' },
  { label: 'Data Sources', value: 'data-sources', icon: 'i-lucide-database-zap' },
  { label: 'Platform', value: 'platform', icon: 'i-lucide-shield-check' },
]
const { data: personaData } = useFetch<{ enabled: boolean }>(
  '/api/client-portal/crm/personas/status',
  { key: 'portal-crm-personas-status' }
)
const canManageDataSources = computed(() =>
  Boolean(user.value?.isPrimaryContact || user.value?.permissions?.canInviteUsers)
)

// Config objects defined for this client (read-only in portal — no designer tab).
const { objects } = useCrmObjectDefs(clientId)
const allTabs = computed(() => [
  ...tabItems,
  ...(personaData.value?.enabled
    ? [
        { label: 'Personas', value: 'personas', icon: 'i-lucide-contact-round' },
        { label: 'Audiences', value: 'audiences', icon: 'i-lucide-users-round' },
      ]
    : []),
  ...objects.value.map(o => ({ label: o.label_plural, value: `obj:${o.key}`, icon: o.icon || 'i-lucide-box' })),
])
const activeObject = computed<CrmObjectDef | null>(() =>
  tab.value.startsWith('obj:') ? (objects.value.find(o => `obj:${o.key}` === tab.value) ?? null) : null,
)
</script>

<template>
  <div class="w-full p-6 space-y-5">
    <div>
      <h1 class="text-2xl font-bold tracking-tight">CRM</h1>
      <p class="text-sm text-muted mt-0.5">Manage your contacts, companies and sales pipeline.</p>
    </div>

    <UTabs v-model="tab" :items="allTabs" class="w-full" />

    <template v-if="clientId">
      <CrmPeopleTable v-if="tab === 'people'" :client-id="clientId" />
      <CrmCompaniesTable v-else-if="tab === 'companies'" :client-id="clientId" />
      <CrmPipelineBoard v-else-if="tab === 'pipeline'" :client-id="clientId" />
      <CrmTaskList v-else-if="tab === 'tasks'" :client-id="clientId" show-filters class="w-full" />
      <CrmDataSources
        v-else-if="tab === 'data-sources'"
        :client-id="clientId"
        api-base="/api/client-portal/crm/data-sources"
        :can-manage="canManageDataSources"
      />
      <div v-else-if="tab === 'platform'" class="space-y-5">
        <CrmPlatformReadiness />
        <CrmBillingAndUsage />
        <CrmSynchronizationHealth />
      </div>
      <CrmPersonas v-else-if="tab === 'personas'" :client-id="clientId" />
      <CrmAudienceCohorts v-else-if="tab === 'audiences'" :client-id="clientId" />
      <template v-else-if="activeObject">
        <CrmEnginePipelineBoard v-if="activeObject.has_pipeline" :client-id="clientId" :object-key="activeObject.key" />
        <CrmEngineRecordsTable v-else :client-id="clientId" :object-key="activeObject.key" />
      </template>
    </template>
    <div v-else class="text-sm text-muted">Loading…</div>
  </div>
</template>
