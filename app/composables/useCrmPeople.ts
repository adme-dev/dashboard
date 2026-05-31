// app/composables/useCrmPeople.ts
import type { CrmPerson, CrmListResponse } from '~/types/crm'

export function useCrmPeople(clientId: Ref<string | null>) {
  const search = useState<string>('crm-people-search', () => '')
  const companyId = useState<string | null>('crm-people-company', () => null)
  const page = useState<number>('crm-people-page', () => 1)
  const query = computed(() => {
    const p: Record<string, string> = { page: String(page.value), page_size: '50' }
    if (clientId.value) p.client_id = clientId.value
    if (search.value.trim()) p.q = search.value.trim()
    if (companyId.value) p.company_id = companyId.value
    return p
  })
  const { data, pending, refresh } = useFetch<CrmListResponse<CrmPerson>>('/api/crm/people', {
    query,
    watch: [query],
    immediate: false,
    default: () => ({ items: [], total: 0, page: 1, page_size: 50 }),
  })
  watch(clientId, (v) => { if (v) refresh() }, { immediate: true })

  async function create(body: Partial<CrmPerson>) {
    const res = await $fetch<{ item: CrmPerson }>('/api/crm/people', { method: 'POST', body: { ...body, client_id: clientId.value } })
    await refresh()
    return res.item
  }
  async function update(id: string, body: Partial<CrmPerson>) {
    const res = await $fetch<{ item: CrmPerson }>(`/api/crm/people/${id}`, { method: 'PATCH', body: { ...body, client_id: clientId.value } })
    await refresh()
    return res.item
  }
  async function remove(id: string) {
    await $fetch(`/api/crm/people/${id}`, { method: 'DELETE', query: { client_id: clientId.value } })
    await refresh()
  }
  async function importCsv(csv: string) {
    const res = await $fetch<{ imported: number, skipped: number, errors: { row: number, message: string }[] }>(
      '/api/crm/people/import', { method: 'POST', body: { client_id: clientId.value, csv } },
    )
    await refresh()
    return res
  }
  return { data, pending, refresh, search, companyId, page, create, update, remove, importCsv }
}
