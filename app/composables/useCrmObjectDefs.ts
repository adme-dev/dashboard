// app/composables/useCrmObjectDefs.ts
import type { CrmObjectDef } from '~/types/crm'

export function useCrmObjectDefs(clientId: Ref<string | null>) {
  const base = inject<string>('crmApiBase', '/api/crm')
  const apiFetch = $fetch as <T = unknown>(
    request: string,
    options?: { method?: string; body?: unknown; query?: Record<string, unknown> },
  ) => Promise<T>
  const query = computed(() => ({ client_id: clientId.value ?? '' }))
  const data = ref<{ items: CrmObjectDef[] }>({ items: [] })

  async function refresh() {
    if (!clientId.value) {
      data.value = { items: [] }
      return
    }

    data.value = await apiFetch<{ items: CrmObjectDef[] }>(`${base}/object-defs`, { query: query.value })
  }

  watch(clientId, () => { refresh() }, { immediate: true })

  async function create(body: Partial<CrmObjectDef>) {
    await apiFetch(`${base}/object-defs`, { method: 'POST', body: { ...body, client_id: clientId.value } })
    await refresh()
  }
  async function update(id: string, body: Partial<CrmObjectDef>) {
    await apiFetch(`${base}/object-defs/${id}`, { method: 'PATCH', body: { ...body, client_id: clientId.value } })
    await refresh()
  }
  async function remove(id: string) {
    await apiFetch(`${base}/object-defs/${id}`, { method: 'DELETE', query: { client_id: clientId.value } })
    await refresh()
  }
  return { objects: computed(() => data.value?.items ?? []), refresh, create, update, remove }
}
