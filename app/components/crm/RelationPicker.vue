<script setup lang="ts">
// Selects a related core record (person/company) for a relation field. Loads options
// from the injected crmApiBase (agency passes client_id; portal derives from session).
const props = defineProps<{ modelValue: string | null, target: 'person' | 'company', clientId: string }>()
const emit = defineEmits<{ 'update:modelValue': [string | null] }>()
const base = inject<string>('crmApiBase', '/api/crm')
const apiFetch = $fetch as <T = unknown>(
  request: string,
  options?: { query?: Record<string, unknown> }
) => Promise<T>
const isPortal = base.includes('client-portal')
const url = computed(() => props.target === 'person' ? `${base}/people` : `${base}/companies`)
const query = computed(() => isPortal ? { page_size: '200' } : { client_id: props.clientId, page_size: '200' })
const data = ref<{ items: any[] }>({ items: [] })

async function refreshOptions() {
  if (!isPortal && !props.clientId) {
    data.value = { items: [] }
    return
  }

  data.value = await apiFetch<{ items: any[] }>(url.value, { query: query.value })
}

watch([url, query], () => { refreshOptions() }, { immediate: true })
const options = computed(() => (data.value?.items ?? []).map((r: any) => ({
  label: props.target === 'person' ? [r.first_name, r.last_name].filter(Boolean).join(' ') || r.email || 'Unnamed' : r.name,
  value: r.id,
})))
const model = computed({
  get: () => props.modelValue ?? undefined,
  set: v => emit('update:modelValue', (v as string) ?? null),
})
</script>

<template>
  <USelectMenu v-model="model" :items="options" value-key="value" placeholder="Select…" searchable />
</template>
