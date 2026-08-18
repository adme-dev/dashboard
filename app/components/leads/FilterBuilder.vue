<script setup lang="ts">
import type { LeadFilter, LeadFilterOp } from '~/types'

const props = defineProps<{
  source: string
  formId: string
}>()

const model = defineModel<LeadFilter | null>('filter')

const enabled = ref<boolean>(!!model.value)
const path = ref<string>(model.value?.field ?? 'field_data.email')
const op = ref<LeadFilterOp>(model.value?.op ?? 'eq')
const value = ref<string>(
  Array.isArray(model.value?.value) ? model.value!.value.join(',') :
    model.value?.value != null ? String(model.value!.value) : '',
)

const apiFetch = $fetch as <T = unknown>(request: string) => Promise<T>
const forms = ref<{ items: any[] }>({ items: [] })

async function refreshForms() {
  forms.value = await apiFetch<{ items: any[] }>('/api/leads/forms/list')
}

await refreshForms()

const fieldOptions = computed(() => {
  const meta = forms.value?.items.find((f: any) => f.source === props.source && f.form_id === props.formId)
  const out: { value: string; label: string }[] = [
    { value: 'campaign_id', label: 'Campaign ID' },
    { value: 'campaign_name', label: 'Campaign name' },
    { value: 'ad_id', label: 'Ad ID' },
    { value: 'ad_name', label: 'Ad name' },
    { value: 'form_id', label: 'Form ID' },
    { value: 'page_id', label: 'Facebook Page ID' },
    { value: 'field_data.vehicle_make', label: 'Vehicle make' },
    { value: 'field_data.vehicle_model', label: 'Vehicle model' },
    { value: 'field_data.retailer_item_id', label: 'Retailer item ID' },
    { value: 'field_data.stock_number', label: 'Stock number' },
    { value: 'score', label: 'score' },
    { value: 'attribution.utm_source', label: 'attribution.utm_source' },
    { value: 'attribution.utm_medium', label: 'attribution.utm_medium' },
    { value: 'attribution.gclid', label: 'attribution.gclid' },
  ]
  const knownPaths = new Set(out.map(option => option.value))
  for (const f of (meta?.fields ?? [])) {
    const fieldPath = `field_data.${f.key}`
    if (!knownPaths.has(fieldPath)) {
      out.push({ value: fieldPath, label: fieldPath })
      knownPaths.add(fieldPath)
    }
  }
  return out
})

const OP_OPTIONS: { value: LeadFilterOp; label: string }[] = [
  { value: 'eq', label: 'equals' },
  { value: 'neq', label: 'not equal' },
  { value: 'gt', label: '>' },
  { value: 'lt', label: '<' },
  { value: 'gte', label: '≥' },
  { value: 'lte', label: '≤' },
  { value: 'contains', label: 'contains' },
  { value: 'starts_with', label: 'starts with' },
  { value: 'ends_with', label: 'ends with' },
  { value: 'is_empty', label: 'is empty' },
  { value: 'is_not_empty', label: 'is not empty' },
  { value: 'in', label: 'in (comma list)' },
  { value: 'not_in', label: 'not in (comma list)' },
]

const valueless = computed(() => op.value === 'is_empty' || op.value === 'is_not_empty')

function emitChange() {
  if (!enabled.value) { model.value = null; return }
  const v: any =
    valueless.value ? null :
    op.value === 'in' || op.value === 'not_in' ? value.value.split(',').map(s => s.trim()).filter(Boolean) :
    /^[gtl]te?$/.test(op.value) ? Number(value.value) :
    value.value
  model.value = { field: path.value, op: op.value, value: v }
}

watch([enabled, path, op, value], emitChange)
</script>

<template>
  <div class="@container space-y-2">
    <UCheckbox v-model="enabled" label="Apply a filter" />
    <div v-if="enabled" class="grid grid-cols-1 gap-2 @lg:grid-cols-3">
      <USelectMenu v-model="path" :items="fieldOptions" value-key="value" class="w-full" />
      <USelectMenu v-model="op" :items="OP_OPTIONS" value-key="value" class="w-full" />
      <UInput v-if="!valueless" v-model="value" placeholder="value" class="w-full" />
    </div>
  </div>
</template>
