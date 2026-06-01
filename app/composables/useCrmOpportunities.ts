// app/composables/useCrmOpportunities.ts
import type { CrmOpportunity, CrmListResponse, CrmFilterClause } from '~/types/crm'

export function useCrmOpportunities(clientId: Ref<string | null>) {
  const base = inject<string>('crmApiBase', '/api/crm')
  const filters = useState<CrmFilterClause[]>('crm-opps-filters', () => [])
  const query = computed(() => {
    const p: Record<string, string> = { page: '1', page_size: '500' }
    if (clientId.value) p.client_id = clientId.value
    if (filters.value.length) p.filters = JSON.stringify(filters.value)
    return p
  })
  const { data, pending, refresh } = useFetch<CrmListResponse<CrmOpportunity>>(`${base}/opportunities`, {
    query,
    watch: [query],
    immediate: false,
    default: () => ({ items: [], total: 0, page: 1, page_size: 500 }),
  })
  watch(clientId, (v) => { if (v) refresh() }, { immediate: true })

  async function create(body: Partial<CrmOpportunity>) {
    const r = await $fetch<{ item: CrmOpportunity }>(`${base}/opportunities`, { method: 'POST', body: { ...body, client_id: clientId.value } })
    await refresh()
    return r.item
  }
  async function update(id: string, body: Partial<CrmOpportunity>) {
    const r = await $fetch<{ item: CrmOpportunity }>(`${base}/opportunities/${id}`, { method: 'PATCH', body: { ...body, client_id: clientId.value } })
    await refresh()
    return r.item
  }
  async function move(id: string, stageId: string) {
    const r = await $fetch<{ item: CrmOpportunity }>(`${base}/opportunities/${id}/move`, { method: 'PATCH', body: { client_id: clientId.value, stage_id: stageId } })
    return r.item
  }
  async function remove(id: string) {
    await $fetch(`${base}/opportunities/${id}`, { method: 'DELETE', query: { client_id: clientId.value } })
    await refresh()
  }
  return { data, pending, refresh, filters, create, update, move, remove }
}
