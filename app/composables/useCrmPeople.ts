// app/composables/useCrmPeople.ts
import type { CrmPerson, CrmListResponse, CrmFilterClause } from '~/types/crm'

export function useCrmPeople(clientId: Ref<string | null>) {
  const base = inject<string>('crmApiBase', '/api/crm')
  const apiFetch = $fetch as <T = unknown>(
    request: string,
    options?: { method?: string; body?: unknown; query?: Record<string, unknown> },
  ) => Promise<T>
  const search = useState<string>('crm-people-search', () => '')
  const companyId = useState<string | null>('crm-people-company', () => null)
  const lifecycle = useState<string | null>('crm-people-lifecycle', () => null)
  const tag = useState<string | null>('crm-people-tag', () => null)
  const filters = useState<CrmFilterClause[]>('crm-people-filters', () => [])
  const page = useState<number>('crm-people-page', () => 1)
  const query = computed(() => {
    const p: Record<string, string> = { page: String(page.value), page_size: '50' }
    if (clientId.value) p.client_id = clientId.value
    if (search.value.trim()) p.q = search.value.trim()
    if (companyId.value) p.company_id = companyId.value
    if (lifecycle.value) p.lifecycle = lifecycle.value
    if (tag.value) p.tag = tag.value
    if (filters.value.length) p.filters = JSON.stringify(filters.value)
    return p
  })
  const defaultResponse = (): CrmListResponse<CrmPerson> => ({ items: [], total: 0, page: 1, page_size: 50 })
  const data = ref<CrmListResponse<CrmPerson>>(defaultResponse())
  const pending = ref(false)

  async function refresh() {
    if (!clientId.value) {
      data.value = defaultResponse()
      return
    }

    pending.value = true
    try {
      data.value = await apiFetch<CrmListResponse<CrmPerson>>(`${base}/people`, { query: query.value })
    } finally {
      pending.value = false
    }
  }

  watch(query, () => { refresh() }, { immediate: true })

  async function create(body: Partial<CrmPerson>) {
    const res = await apiFetch<{ item: CrmPerson }>(`${base}/people`, { method: 'POST', body: { ...body, client_id: clientId.value } })
    await refresh()
    return res.item
  }
  async function update(id: string, body: Partial<CrmPerson>) {
    const res = await apiFetch<{ item: CrmPerson }>(`${base}/people/${id}`, { method: 'PATCH', body: { ...body, client_id: clientId.value } })
    await refresh()
    return res.item
  }
  async function remove(id: string) {
    await apiFetch(`${base}/people/${id}`, { method: 'DELETE', query: { client_id: clientId.value } })
    await refresh()
  }
  async function importCsv(csv: string) {
    const res = await apiFetch<{ imported: number, skipped: number, errors: { row: number, message: string }[] }>(
      `${base}/people/import`, { method: 'POST', body: { client_id: clientId.value, csv } },
    )
    await refresh()
    return res
  }
  return { data, pending, refresh, search, companyId, lifecycle, tag, filters, page, create, update, remove, importCsv }
}
