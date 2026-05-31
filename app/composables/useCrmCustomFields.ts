// app/composables/useCrmCustomFields.ts
import type { CrmCustomField } from '~/types/crm'

export function useCrmCustomFields(clientId: Ref<string | null>, objectType: 'person' | 'company') {
  const base = inject<string>('crmApiBase', '/api/crm')
  const query = computed(() => ({ client_id: clientId.value ?? '', object_type: objectType }))
  const { data, refresh } = useFetch<{ items: CrmCustomField[] }>(`${base}/custom-fields`, {
    query,
    watch: [query],
    immediate: false,
    default: () => ({ items: [] }),
  })
  watch(clientId, (v) => { if (v) refresh() }, { immediate: true })

  async function create(body: Partial<CrmCustomField>) {
    await $fetch(`${base}/custom-fields`, { method: 'POST', body: { ...body, client_id: clientId.value, object_type: objectType } })
    await refresh()
  }
  async function remove(id: string) {
    await $fetch(`${base}/custom-fields/${id}`, { method: 'DELETE', query: { client_id: clientId.value } })
    await refresh()
  }
  return { fields: computed(() => data.value?.items ?? []), refresh, create, remove }
}
