// app/composables/useCrmCustomFields.ts
import type { CrmCustomField } from '~/types/crm'

export function useCrmCustomFields(clientId: Ref<string | null>, objectType: 'person' | 'company') {
  const base = inject<string>('crmApiBase', '/api/crm')
  const apiFetch = $fetch as <T = unknown>(
    request: string,
    options?: { method?: string; body?: unknown; query?: Record<string, unknown> },
  ) => Promise<T>
  const query = computed(() => ({ client_id: clientId.value ?? '', object_type: objectType }))
  const data = ref<{ items: CrmCustomField[] }>({ items: [] })

  async function refresh() {
    if (!clientId.value) {
      data.value = { items: [] }
      return
    }

    data.value = await apiFetch<{ items: CrmCustomField[] }>(`${base}/custom-fields`, { query: query.value })
  }

  watch(query, () => { refresh() }, { immediate: true })

  async function create(body: Partial<CrmCustomField>) {
    await apiFetch(`${base}/custom-fields`, { method: 'POST', body: { ...body, client_id: clientId.value, object_type: objectType } })
    await refresh()
  }
  async function remove(id: string) {
    await apiFetch(`${base}/custom-fields/${id}`, { method: 'DELETE', query: { client_id: clientId.value } })
    await refresh()
  }
  return { fields: computed(() => data.value?.items ?? []), refresh, create, remove }
}
