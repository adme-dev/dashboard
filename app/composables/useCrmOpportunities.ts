// app/composables/useCrmOpportunities.ts
import type { CrmOpportunity, CrmListResponse, CrmFilterClause } from '~/types/crm'

export function useCrmOpportunities(clientId: Ref<string | null>) {
  const base = inject<string>('crmApiBase', '/api/crm')
  const apiFetch = $fetch as <T = unknown>(
    request: string,
    options?: { method?: string; body?: unknown; query?: Record<string, unknown> },
  ) => Promise<T>
  const filters = useState<CrmFilterClause[]>('crm-opps-filters', () => [])
  const query = computed(() => {
    const p: Record<string, string> = { page: '1', page_size: '500' }
    if (clientId.value) p.client_id = clientId.value
    if (filters.value.length) p.filters = JSON.stringify(filters.value)
    return p
  })
  const defaultResponse = (): CrmListResponse<CrmOpportunity> => ({ items: [], total: 0, page: 1, page_size: 500 })
  const data = ref<CrmListResponse<CrmOpportunity>>(defaultResponse())
  const pending = ref(false)

  async function refresh() {
    if (!clientId.value) {
      data.value = defaultResponse()
      return
    }

    pending.value = true
    try {
      data.value = await apiFetch<CrmListResponse<CrmOpportunity>>(`${base}/opportunities`, { query: query.value })
    } finally {
      pending.value = false
    }
  }

  watch(query, () => { refresh() }, { immediate: true })

  async function create(body: Partial<CrmOpportunity>) {
    const r = await apiFetch<{ item: CrmOpportunity }>(`${base}/opportunities`, { method: 'POST', body: { ...body, client_id: clientId.value } })
    await refresh()
    return r.item
  }
  async function update(id: string, body: Partial<CrmOpportunity>) {
    const r = await apiFetch<{ item: CrmOpportunity }>(`${base}/opportunities/${id}`, { method: 'PATCH', body: { ...body, client_id: clientId.value } })
    await refresh()
    return r.item
  }
  async function move(id: string, stageId: string, expectedStageId: string) {
    const r = await apiFetch<{ item: CrmOpportunity }>(`${base}/opportunities/${id}/move`, {
      method: 'PATCH',
      body: {
        client_id: clientId.value,
        stage_id: stageId,
        expected_stage_id: expectedStageId
      }
    })
    return r.item
  }
  async function remove(id: string) {
    await apiFetch(`${base}/opportunities/${id}`, { method: 'DELETE', query: { client_id: clientId.value } })
    await refresh()
  }
  return { data, pending, refresh, filters, create, update, move, remove }
}
