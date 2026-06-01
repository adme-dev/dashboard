// app/composables/useCrmRecords.ts
// Drives one config object's records. Works for both agency (/api/crm, needs client_id)
// and portal (/api/client-portal/crm, client from session) via the injected crmApiBase.
import type { CrmRecord, CrmFieldDef, CrmObjectDef, CrmListResponse } from '~/types/crm'

interface RecordsResponse extends CrmListResponse<CrmRecord> {
  object: CrmObjectDef
  fields: CrmFieldDef[]
}

export function useCrmRecords(clientId: Ref<string | null>, objectKey: Ref<string | null>) {
  const base = inject<string>('crmApiBase', '/api/crm')
  const isPortal = base.includes('client-portal')
  const search = ref('')
  const page = ref(1)
  const query = computed(() => {
    const p: Record<string, string> = { objectKey: objectKey.value ?? '', page: String(page.value), page_size: '50' }
    if (!isPortal && clientId.value) p.client_id = clientId.value
    if (search.value.trim()) p.q = search.value.trim()
    return p
  })
  const { data, pending, refresh } = useFetch<RecordsResponse>(`${base}/records`, {
    query, watch: [query], immediate: false,
    default: () => ({ items: [], total: 0, page: 1, page_size: 50, object: null as any, fields: [] }),
  })
  watch([clientId, objectKey], ([c, o]) => { if ((isPortal || c) && o) refresh() }, { immediate: true })

  function withClient(body: Record<string, unknown>) {
    return isPortal ? body : { ...body, client_id: clientId.value }
  }
  async function create(recordData: Record<string, unknown>, stage_id?: string | null) {
    await $fetch(`${base}/records`, { method: 'POST', body: withClient({ objectKey: objectKey.value, data: recordData, stage_id }) })
    await refresh()
  }
  async function update(id: string, recordData: Record<string, unknown>, stage_id?: string | null) {
    await $fetch(`${base}/records/${id}`, { method: 'PATCH', body: withClient({ data: recordData, ...(stage_id !== undefined ? { stage_id } : {}) }) })
    await refresh()
  }
  async function remove(id: string) {
    await $fetch(`${base}/records/${id}`, { method: 'DELETE', query: isPortal ? {} : { client_id: clientId.value } })
    await refresh()
  }
  async function move(id: string, stage_id: string) {
    await $fetch(`${base}/records/${id}/move`, { method: 'PATCH', body: withClient({ stage_id }) })
    await refresh()
  }
  return { data, pending, refresh, search, page, create, update, remove, move }
}
