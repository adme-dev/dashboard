<script setup lang="ts">
import type { CrmPerson, CrmCompany } from '~/types/crm'

const props = defineProps<{
  clientId: string
  targetType: 'person' | 'company'
  targetId: string
}>()
const base = inject<string>('crmApiBase', '/api/crm')
const toast = useToast()
const apiFetch = $fetch as <T = unknown>(
  request: string,
  options?: { method?: string; body?: unknown; query?: Record<string, unknown> },
) => Promise<T>

interface RelView {
  id: string
  other_type: 'person' | 'company'
  other_id: string
  other_name: string
  relationship_type: string
  is_decision_maker: boolean
}
const query = computed(() => ({ client_id: props.clientId, target_type: props.targetType, target_id: props.targetId }))
const data = ref<{ items: RelView[] }>({ items: [] })

async function refresh() {
  data.value = await apiFetch<{ items: RelView[] }>(`${base}/relationships`, { query: query.value })
}

watch(query, () => {
  refresh()
}, { immediate: true })

const rels = computed(() => data.value?.items ?? [])

// Candidate "other" records (people + companies), excluding self.
const listQuery = computed(() => ({ client_id: props.clientId, page_size: '200' }))
const peopleData = ref<{ items: CrmPerson[] }>({ items: [] })
const companiesData = ref<{ items: CrmCompany[] }>({ items: [] })

async function refreshCandidateRecords() {
  const [people, companies] = await Promise.all([
    apiFetch<{ items: CrmPerson[] }>(`${base}/people`, { query: listQuery.value }),
    apiFetch<{ items: CrmCompany[] }>(`${base}/companies`, { query: listQuery.value }),
  ])
  peopleData.value = people
  companiesData.value = companies
}

watch(listQuery, () => {
  refreshCandidateRecords()
}, { immediate: true })

const otherItems = computed(() => {
  const ppl = (peopleData.value?.items ?? [])
    .filter(p => !(props.targetType === 'person' && p.id === props.targetId))
    .map(p => ({ label: `${[p.first_name, p.last_name].filter(Boolean).join(' ')} · person`, value: `person:${p.id}` }))
  const cos = (companiesData.value?.items ?? [])
    .filter(c => !(props.targetType === 'company' && c.id === props.targetId))
    .map(c => ({ label: `${c.name} · company`, value: `company:${c.id}` }))
  return [...ppl, ...cos]
})

// Relationship type options depend on the (target, other) type pair.
const TYPE_OPTIONS: Record<string, { label: string, value: string }[]> = {
  'person:person': [
    { label: 'Reports to', value: 'reports_to' }, { label: 'Manages', value: 'manages' },
    { label: 'Colleague', value: 'colleague' }, { label: 'Spouse', value: 'spouse' },
    { label: 'Parent of', value: 'parent' }, { label: 'Child of', value: 'child' },
    { label: 'Sibling', value: 'sibling' }, { label: 'Referred by', value: 'referred_by' },
  ],
  'person:company': [
    { label: 'Works at', value: 'works_at' }, { label: 'Decision maker at', value: 'decision_maker_at' },
  ],
  'company:person': [
    { label: 'Employs', value: 'employs' }, { label: 'Decision maker', value: 'has_decision_maker' },
  ],
  'company:company': [
    { label: 'Parent of', value: 'parent_of' }, { label: 'Subsidiary of', value: 'subsidiary_of' },
  ],
}

const showAdd = ref(false)
const form = reactive({ other: '', relationship_type: '', is_decision_maker: false })
const otherType = computed(() => (form.other ? form.other.split(':')[0] : '') as 'person' | 'company' | '')
const typeItems = computed(() => otherType.value ? (TYPE_OPTIONS[`${props.targetType}:${otherType.value}`] ?? []) : [])
const saving = ref(false)

watch(() => form.other, () => { form.relationship_type = typeItems.value[0]?.value ?? '' })

function openAdd() { form.other = ''; form.relationship_type = ''; form.is_decision_maker = false; showAdd.value = true }

async function save() {
  if (!form.other || !form.relationship_type) {
    toast.add({ title: 'Pick a record and a relationship', color: 'error' }); return
  }
  const [to_type, to_id] = form.other.split(':')
  saving.value = true
  try {
    await apiFetch(`${base}/relationships`, {
      method: 'POST',
      body: {
        client_id: props.clientId,
        from_type: props.targetType, from_id: props.targetId,
        to_type, to_id, relationship_type: form.relationship_type,
        is_decision_maker: form.is_decision_maker,
      },
    })
    showAdd.value = false
    await refresh()
    toast.add({ title: 'Relationship added', color: 'success' })
  } catch (e: unknown) {
    toast.add({ title: 'Could not add relationship', description: (e as { data?: { statusMessage?: string } })?.data?.statusMessage, color: 'error' })
  } finally {
    saving.value = false
  }
}
async function remove(r: RelView) {
  try {
    await apiFetch(`${base}/relationships/${r.id}`, { method: 'DELETE', query: { client_id: props.clientId } })
    await refresh()
  } catch { toast.add({ title: 'Could not remove', color: 'error' }) }
}
function label(type: string) { return type.replace(/_/g, ' ') }
</script>

<template>
  <div>
    <div class="flex items-center justify-between gap-2 mb-3">
      <h3 class="text-sm font-semibold text-highlighted">Relationships</h3>
      <UButton size="xs" icon="i-lucide-plus" variant="ghost" color="neutral" @click="openAdd">Add</UButton>
    </div>

    <div v-if="!rels.length" class="rounded-lg border border-dashed border-default py-4 text-center text-sm text-muted">
      No relationships yet.
    </div>
    <ul v-else class="space-y-1.5">
      <li v-for="r in rels" :key="r.id" class="group flex items-center justify-between gap-2 rounded-lg border border-default px-3 py-2">
        <div class="min-w-0 text-sm">
          <span class="text-muted">{{ label(r.relationship_type) }}</span>
          <span class="font-medium text-highlighted"> {{ r.other_name }}</span>
          <UIcon v-if="r.other_type === 'company'" name="i-lucide-building-2" class="inline size-3.5 ml-1 text-muted" />
          <UBadge v-if="r.is_decision_maker" color="warning" variant="subtle" size="sm" class="ml-2">decision maker</UBadge>
        </div>
        <UButton icon="i-lucide-x" color="neutral" variant="ghost" size="xs" class="opacity-0 group-hover:opacity-100" @click="remove(r)" />
      </li>
    </ul>

    <UModal v-model:open="showAdd" title="Add relationship">
      <template #body>
        <form class="space-y-4" @submit.prevent="save">
          <UFormField label="Related record" required>
            <USelectMenu v-model="form.other" :items="otherItems" value-key="value" placeholder="Pick a person or company" searchable />
          </UFormField>
          <UFormField label="Relationship" required>
            <USelectMenu v-model="form.relationship_type" :items="typeItems" value-key="value" :disabled="!form.other" placeholder="Select type" />
          </UFormField>
          <UCheckbox v-model="form.is_decision_maker" label="Decision maker" />
          <div class="flex justify-end gap-2 pt-1">
            <UButton type="button" variant="ghost" color="neutral" @click="showAdd = false">Cancel</UButton>
            <UButton type="submit" :loading="saving">Add</UButton>
          </div>
        </form>
      </template>
    </UModal>
  </div>
</template>
