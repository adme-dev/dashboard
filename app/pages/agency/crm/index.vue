<script setup lang="ts">
definePageMeta({ layout: 'agency' })
useHead({ title: 'CRM — XeroFlow Agency' })

// Clients to pick from (reuse the existing agency clients endpoint — returns a bare array).
const { data: clientsData } = await useFetch<{ id: string, name: string }[]>('/api/agency/clients')
const clientOptions = computed(() => (clientsData.value ?? []).map(c => ({ label: c.name, value: c.id })))

const clientId = useState<string | null>('crm-active-client', () => null)
const tab = ref<'people' | 'companies' | 'pipeline'>('people')
const tabItems = [
  { label: 'People', value: 'people', icon: 'i-lucide-users' },
  { label: 'Companies', value: 'companies', icon: 'i-lucide-building-2' },
  { label: 'Pipeline', value: 'pipeline', icon: 'i-lucide-trello' },
]
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
      <UTabs v-model="tab" :items="tabItems" class="w-full" />
      <CrmPeopleTable v-if="tab === 'people'" :client-id="clientId" />
      <CrmCompaniesTable v-else-if="tab === 'companies'" :client-id="clientId" />
      <CrmPipelineBoard v-else :client-id="clientId" />
    </template>
  </div>
</template>
