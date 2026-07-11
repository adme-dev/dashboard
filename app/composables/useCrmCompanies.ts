// app/composables/useCrmCompanies.ts
import type { CrmCompany, CrmListResponse, CrmFilterClause } from '~/types/crm'

export function useCrmCompanies(clientId: Ref<string | null>) {
  const base = inject<string>('crmApiBase', '/api/crm')
  const apiFetch = $fetch as <T = unknown>(
    request: string,
    options?: { method?: string; body?: unknown; query?: Record<string, unknown> },
  ) => Promise<T>
  const search = useState<string>('crm-companies-search', () => '')
  const lifecycle = useState<string | null>('crm-companies-lifecycle', () => null)
  const tag = useState<string | null>('crm-companies-tag', () => null)
  const filters = useState<CrmFilterClause[]>('crm-companies-filters', () => [])
  const page = useState<number>('crm-companies-page', () => 1)
  const query = computed(() => {
    const p: Record<string, string> = { page: String(page.value), page_size: '50' }
    if (clientId.value) p.client_id = clientId.value
    if (search.value.trim()) p.q = search.value.trim()
    if (lifecycle.value) p.lifecycle = lifecycle.value
    if (tag.value) p.tag = tag.value
    if (filters.value.length) p.filters = JSON.stringify(filters.value)
    return p
  })
  const defaultResponse = (): CrmListResponse<CrmCompany> => ({ items: [], total: 0, page: 1, page_size: 50 })
  const data = ref<CrmListResponse<CrmCompany>>(defaultResponse())
  const pending = ref(false)

  async function refresh() {
    if (!clientId.value) {
      data.value = defaultResponse()
      return
    }

    pending.value = true
    try {
      data.value = await apiFetch<CrmListResponse<CrmCompany>>(`${base}/companies`, { query: query.value })
    } finally {
      pending.value = false
    }
  }

  watch(query, () => { refresh() }, { immediate: true })

  async function create(body: Partial<CrmCompany>) {
    const res = await apiFetch<{ item: CrmCompany }>(`${base}/companies`, { method: 'POST', body: { ...body, client_id: clientId.value } })
    await refresh()
    return res.item
  }
  async function update(id: string, body: Partial<CrmCompany>) {
    const res = await apiFetch<{ item: CrmCompany }>(`${base}/companies/${id}`, { method: 'PATCH', body: { ...body, client_id: clientId.value } })
    await refresh()
    return res.item
  }
  async function remove(id: string) {
    await apiFetch(`${base}/companies/${id}`, { method: 'DELETE', query: { client_id: clientId.value } })
    await refresh()
  }
  return { data, pending, refresh, search, lifecycle, tag, filters, page, create, update, remove }
}
