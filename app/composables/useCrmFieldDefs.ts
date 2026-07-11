// app/composables/useCrmFieldDefs.ts
import type { CrmFieldDef } from '~/types/crm'

export function useCrmFieldDefs(clientId: Ref<string | null>, objectDefId: Ref<string | null>) {
  const base = inject<string>('crmApiBase', '/api/crm')
  const apiFetch = $fetch as <T = unknown>(
    request: string,
    options?: { method?: string; body?: unknown; query?: Record<string, unknown> },
  ) => Promise<T>
  const query = computed(() => ({ client_id: clientId.value ?? '' }))
  const url = computed(() => `${base}/object-defs/${objectDefId.value}/field-defs`)
  const data = ref<{ items: CrmFieldDef[] }>({ items: [] })

  async function refresh() {
    if (!clientId.value || !objectDefId.value) {
      data.value = { items: [] }
      return
    }

    data.value = await apiFetch<{ items: CrmFieldDef[] }>(url.value, { query: query.value })
  }

  watch([clientId, objectDefId], () => { refresh() }, { immediate: true })

  async function create(body: Partial<CrmFieldDef>) {
    await apiFetch(`${base}/object-defs/${objectDefId.value}/field-defs`, { method: 'POST', body: { ...body, client_id: clientId.value } })
    await refresh()
  }
  async function update(fid: string, body: Partial<CrmFieldDef>) {
    await apiFetch(`${base}/object-defs/${objectDefId.value}/field-defs/${fid}`, { method: 'PATCH', body: { ...body, client_id: clientId.value } })
    await refresh()
  }
  async function remove(fid: string) {
    await apiFetch(`${base}/object-defs/${objectDefId.value}/field-defs/${fid}`, { method: 'DELETE', query: { client_id: clientId.value } })
    await refresh()
  }
  return { fields: computed(() => data.value?.items ?? []), refresh, create, update, remove }
}
