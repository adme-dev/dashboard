<script setup lang="ts">
import type { CrmObjectDef } from '~/types/crm'

interface CrmVertical { key: string, name: string, kind: 'code' | 'config', is_core: boolean }
definePageMeta({ layout: 'agency' })
useHead({ title: 'CRM — XeroFlow Agency' })

// Clients to pick from (reuse the existing agency clients endpoint — returns a bare array).
const apiFetch = $fetch as <T = unknown>(
  request: string,
  options?: { method?: string; body?: unknown; query?: Record<string, unknown> }
) => Promise<T>
const clientsData = ref<{ id: string, name: string }[]>([])
const route = useRoute()

async function refreshClients() {
  clientsData.value = await apiFetch<{ id: string, name: string }[]>('/api/agency/clients').catch(() => [])
}

await refreshClients()
const clientOptions = computed(() => (clientsData.value ?? []).map(c => ({ label: c.name, value: c.id })))

const clientId = useState<string | null>('crm-active-client', () => null)
const requestedClientId = typeof route.query.clientId === 'string' ? route.query.clientId : ''
if (requestedClientId && clientsData.value.some(client => client.id === requestedClientId)) {
  clientId.value = requestedClientId
}
const tab = ref<string>(typeof route.query.tab === 'string' ? route.query.tab : 'people')
const tabItems = [
  { label: 'People', value: 'people', icon: 'i-lucide-users' },
  { label: 'Companies', value: 'companies', icon: 'i-lucide-building-2' },
  { label: 'Pipeline', value: 'pipeline', icon: 'i-lucide-trello' },
  { label: 'Tasks', value: 'tasks', icon: 'i-lucide-list-checks' },
  { label: 'Insights', value: 'insights', icon: 'i-lucide-chart-no-axes-column' },
  { label: 'Duplicates', value: 'duplicates', icon: 'i-lucide-copy' },
  { label: 'Data Sources', value: 'data-sources', icon: 'i-lucide-database-zap' },
  { label: 'Settings', value: 'settings', icon: 'i-lucide-shield' },
]

// Custom config objects for the active client + the verticals that drive the designer.
const toast = useToast()
const { objects, refresh: refreshObjects } = useCrmObjectDefs(clientId)
const verticalsData = ref<{ all: CrmVertical[], enabled: string[] }>({ all: [], enabled: ['generic'] })

async function refreshVerticals() {
  verticalsData.value = await apiFetch<{ all: CrmVertical[], enabled: string[] }>('/api/crm/verticals', {
    query: clientId.value ? { client_id: clientId.value } : undefined
  }).catch(() => ({ all: [], enabled: ['generic'] }))
}

await refreshVerticals()
watch(clientId, () => {
  void refreshVerticals()
})
const enabledSet = computed(() => new Set(verticalsData.value?.enabled ?? []))
const configVerticals = computed(() => [...enabledSet.value].filter(v => v !== 'generic'))
// Verticals this client can toggle on/off (the always-on 'generic' core is kind:'code').
const assignableVerticals = computed(() => (verticalsData.value?.all ?? []).filter(v => v.kind === 'config'))
// Gate object tabs by enabled vertical: the agency object-defs list isn't vertical-filtered
// server-side, so mirror the records/portal visibility rule client-side here.
const visibleObjects = computed(() => objects.value.filter(o => enabledSet.value.has(o.vertical_key)))

const pendingVertical = ref<string | null>(null)
async function toggleVertical(key: string, enabled: boolean) {
  if (!clientId.value) return
  pendingVertical.value = key
  try {
    await apiFetch('/api/crm/verticals/assign', { method: 'POST', body: { client_id: clientId.value, vertical_key: key, enabled } })
    await Promise.all([refreshVerticals(), refreshObjects()])
    toast.add({ title: `${key} ${enabled ? 'enabled' : 'disabled'}`, color: 'success' })
  } catch (e: any) {
    toast.add({ title: 'Could not update vertical', description: e?.data?.statusMessage || e?.message, color: 'error' })
  } finally {
    pendingVertical.value = null
  }
}

const allTabs = computed(() => [
  ...tabItems,
  ...visibleObjects.value.map(o => ({ label: o.label_plural, value: `obj:${o.key}`, icon: o.icon || 'i-lucide-box' })),
  { label: 'Custom Objects', value: 'designer', icon: 'i-lucide-settings-2' },
])
const activeObject = computed<CrmObjectDef | null>(() =>
  tab.value.startsWith('obj:') ? (visibleObjects.value.find(o => `obj:${o.key}` === tab.value) ?? null) : null,
)
// Reset to a core tab when the client changes — a config-object tab may not exist for the new client.
watch(clientId, () => { tab.value = 'people' })

// F8 global search — route a selected hit to the matching list tab.
const SEARCH_TYPE_TAB: Record<string, string> = {
  person: 'people', company: 'companies', opportunity: 'pipeline', task: 'tasks', activity: 'tasks',
}
function onSearchSelect(r: { type: string }) {
  tab.value = SEARCH_TYPE_TAB[r.type] ?? 'people'
}
</script>

<template>
  <div class="p-6 space-y-5">
    <div class="flex items-end justify-between gap-4">
      <div>
        <h1 class="text-2xl font-bold tracking-tight">CRM</h1>
        <p class="text-sm text-muted mt-0.5">Manage a client's contacts and companies.</p>
      </div>
      <div class="flex items-end gap-3">
        <CrmGlobalSearch v-if="clientId" :client-id="clientId" @select="onSearchSelect" />
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
      <template v-else-if="tab === 'pipeline'">
        <CrmPipelineBoard :client-id="clientId" />
        <CrmStageAutomationManager :client-id="clientId" class="mt-5 max-w-2xl" />
      </template>
      <CrmTaskList v-else-if="tab === 'tasks'" :client-id="clientId" show-filters class="max-w-3xl" />
      <CrmInsights v-else-if="tab === 'insights'" :client-id="clientId" />
      <CrmDuplicatesManager v-else-if="tab === 'duplicates'" :client-id="clientId" />
      <CrmDataSources v-else-if="tab === 'data-sources'" :client-id="clientId" />
      <CrmGovernanceSettings v-else-if="tab === 'settings'" :client-id="clientId" />
      <template v-else-if="tab === 'designer'">
        <div class="space-y-5">
          <!-- Enable / disable config verticals for this client -->
          <div class="rounded-xl border border-default divide-y divide-default">
            <div class="px-4 py-3">
              <h3 class="text-sm font-semibold">Config verticals</h3>
              <p class="text-xs text-muted mt-0.5">
                Enable a vertical to seed its objects for this client (e.g. Retail adds Products &amp; Orders).
              </p>
            </div>
            <div v-if="!assignableVerticals.length" class="px-4 py-3 text-sm text-muted">
              No config verticals available.
            </div>
            <div
              v-for="v in assignableVerticals"
              :key="v.key"
              class="flex items-center justify-between gap-4 px-4 py-3"
            >
              <div class="min-w-0">
                <p class="text-sm font-medium">{{ v.name }}</p>
                <p class="text-xs text-muted">{{ v.key }}</p>
              </div>
              <USwitch
                :model-value="enabledSet.has(v.key)"
                :disabled="pendingVertical === v.key"
                @update:model-value="(on) => toggleVertical(v.key, on)"
              />
            </div>
          </div>

          <!-- Object / field designers for each enabled vertical -->
          <div v-if="!configVerticals.length" class="text-sm text-muted">
            Enable a config vertical above to define its objects and fields.
          </div>
          <div v-for="vk in configVerticals" :key="vk" class="space-y-2">
            <h3 class="text-sm font-semibold capitalize">{{ vk }}</h3>
            <CrmObjectDefManager :client-id="clientId" :vertical-key="vk" />
          </div>
        </div>
      </template>
      <template v-else-if="activeObject">
        <CrmEnginePipelineBoard v-if="activeObject.has_pipeline" :client-id="clientId" :object-key="activeObject.key" />
        <CrmEngineRecordsTable v-else :client-id="clientId" :object-key="activeObject.key" />
      </template>
    </template>
  </div>
</template>
