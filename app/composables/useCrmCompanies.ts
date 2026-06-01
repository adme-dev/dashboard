// app/composables/useCrmCompanies.ts
import type { CrmCompany, CrmListResponse, CrmFilterClause } from '~/types/crm'

export function useCrmCompanies(clientId: Ref<string | null>) {
  const base = inject<string>('crmApiBase', '/api/crm')
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
  const { data, pending, refresh } = useFetch<CrmListResponse<CrmCompany>>(`${base}/companies`, {
    query,
    watch: [query],
    immediate: false,
    default: () => ({ items: [], total: 0, page: 1, page_size: 50 }),
  })
  watch(clientId, (v) => { if (v) refresh() }, { immediate: true })

  async function create(body: Partial<CrmCompany>) {
    const res = await $fetch<{ item: CrmCompany }>(`${base}/companies`, { method: 'POST', body: { ...body, client_id: clientId.value } })
    await refresh()
    return res.item
  }
  async function update(id: string, body: Partial<CrmCompany>) {
    const res = await $fetch<{ item: CrmCompany }>(`${base}/companies/${id}`, { method: 'PATCH', body: { ...body, client_id: clientId.value } })
    await refresh()
    return res.item
  }
  async function remove(id: string) {
    await $fetch(`${base}/companies/${id}`, { method: 'DELETE', query: { client_id: clientId.value } })
    await refresh()
  }
  return { data, pending, refresh, search, lifecycle, tag, filters, page, create, update, remove }
}
