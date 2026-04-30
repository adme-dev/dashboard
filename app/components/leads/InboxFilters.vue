<script setup lang="ts">
import type { LeadsListFilters } from '~/types/leadsUi'

const model = defineModel<LeadsListFilters>('filters', { required: true })

interface ClientOption { id: string; name: string }
interface FormOption { form_id: string; form_name: string | null; source: string }
interface UserOption { id: string; name: string }

// /api/agency/clients returns a plain array (not { items: [] })
const { data: clients } = useFetch<ClientOption[]>('/api/agency/clients', {
  default: () => [],
})
// /api/leads/forms/list returns { items: LeadFormMetadata[] }
const { data: forms } = useFetch<{ items: FormOption[] }>('/api/leads/forms/list', {
  default: () => ({ items: [] }),
})
// /api/agency/team-members returns { members: [...] } (no summary/departments/roles wrapper)
const { data: teamData } = useFetch<{ members: UserOption[] }>('/api/agency/team-members', {
  default: () => ({ members: [] }),
})

const SOURCE_OPTIONS = [
  { value: 'all', label: 'All sources' },
  { value: 'meta', label: 'Meta' },
  { value: 'google', label: 'Google' },
  { value: 'manual', label: 'Manual' },
]
const STATUS_OPTIONS = [
  { value: 'all', label: 'All statuses' },
  { value: 'new', label: 'New' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'qualified', label: 'Qualified' },
  { value: 'won', label: 'Won' },
  { value: 'lost', label: 'Lost' },
  { value: 'spam_suspected', label: 'Spam?' },
]

const clientOptions = computed(() => [
  { value: 'all', label: 'All clients' },
  { value: 'unmapped', label: 'Unmapped' },
  ...((clients.value ?? []) as ClientOption[]).map(c => ({ value: c.id, label: c.name })),
])
const formOptions = computed(() => [
  { value: 'all', label: 'All forms' },
  ...(forms.value?.items ?? []).map((f: FormOption) => ({
    value: f.form_id,
    label: f.form_name || f.form_id,
  })),
])
const userOptions = computed(() => [
  { value: 'all', label: 'All assignees' },
  ...((teamData.value?.members ?? []) as UserOption[]).map(u => ({ value: u.id, label: u.name })),
])

// Bridge sentinels <-> nullable model fields
const clientSel = computed({
  get: () => model.value.unmapped ? 'unmapped' : (model.value.client_id ?? 'all'),
  set: (v: string) => {
    if (v === 'unmapped') {
      model.value.client_id = null
      model.value.unmapped = true
    } else if (v === 'all') {
      model.value.client_id = null
      model.value.unmapped = false
    } else {
      model.value.client_id = v
      model.value.unmapped = false
    }
  },
})
const sourceSel = computed({
  get: () => model.value.source ?? 'all',
  set: (v: string) => { model.value.source = v === 'all' ? null : v as any },
})
const statusSel = computed({
  get: () => model.value.status ?? 'all',
  set: (v: string) => { model.value.status = v === 'all' ? null : v as any },
})
const formSel = computed({
  get: () => model.value.form_id ?? 'all',
  set: (v: string) => { model.value.form_id = v === 'all' ? null : v },
})
const userSel = computed({
  get: () => model.value.assigned_to ?? 'all',
  set: (v: string) => { model.value.assigned_to = v === 'all' ? null : v },
})
</script>

<template>
  <div class="flex flex-wrap items-center gap-2 p-3 border-b border-default bg-elevated/30">
    <UInput
      v-model="model.q"
      placeholder="Search field data..."
      icon="i-lucide-search"
      class="w-64"
    />
    <USelectMenu
      v-model="clientSel"
      :items="clientOptions"
      value-key="value"
      class="w-48"
    />
    <USelectMenu
      v-model="sourceSel"
      :items="SOURCE_OPTIONS"
      value-key="value"
      class="w-36"
    />
    <USelectMenu
      v-model="formSel"
      :items="formOptions"
      value-key="value"
      class="w-48"
    />
    <USelectMenu
      v-model="statusSel"
      :items="STATUS_OPTIONS"
      value-key="value"
      class="w-36"
    />
    <USelectMenu
      v-model="userSel"
      :items="userOptions"
      value-key="value"
      class="w-44"
    />
    <UInput v-model="model.from" type="date" class="w-40" />
    <UInput v-model="model.to" type="date" class="w-40" />
  </div>
</template>
