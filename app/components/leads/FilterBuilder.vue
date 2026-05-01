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

const { data: forms } = useFetch<{ items: any[] }>('/api/leads/forms/list', {
  default: () => ({ items: [] }),
})

const fieldOptions = computed(() => {
  const meta = forms.value?.items.find((f: any) => f.source === props.source && f.form_id === props.formId)
  const out: { value: string; label: string }[] = [
    { value: 'score', label: 'score' },
    { value: 'attribution.utm_source', label: 'attribution.utm_source' },
    { value: 'attribution.utm_medium', label: 'attribution.utm_medium' },
    { value: 'attribution.gclid', label: 'attribution.gclid' },
  ]
  for (const f of (meta?.fields ?? [])) {
    out.unshift({ value: `field_data.${f.key}`, label: `field_data.${f.key}` })
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
  <div class="space-y-2">
    <UCheckbox v-model="enabled" label="Apply a filter" />
    <div v-if="enabled" class="grid grid-cols-3 gap-2">
      <USelectMenu v-model="path" :items="fieldOptions" value-key="value" />
      <USelectMenu v-model="op" :items="OP_OPTIONS" value-key="value" />
      <UInput v-if="!valueless" v-model="value" placeholder="value" />
    </div>
  </div>
</template>
