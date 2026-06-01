// app/composables/useCrmPeople.ts
import type { CrmPerson, CrmListResponse } from '~/types/crm'

export function useCrmPeople(clientId: Ref<string | null>) {
  const base = inject<string>('crmApiBase', '/api/crm')
  const search = useState<string>('crm-people-search', () => '')
  const companyId = useState<string | null>('crm-people-company', () => null)
  const lifecycle = useState<string | null>('crm-people-lifecycle', () => null)
  const tag = useState<string | null>('crm-people-tag', () => null)
  const page = useState<number>('crm-people-page', () => 1)
  const query = computed(() => {
    const p: Record<string, string> = { page: String(page.value), page_size: '50' }
    if (clientId.value) p.client_id = clientId.value
    if (search.value.trim()) p.q = search.value.trim()
    if (companyId.value) p.company_id = companyId.value
    if (lifecycle.value) p.lifecycle = lifecycle.value
    if (tag.value) p.tag = tag.value
    return p
  })
  const { data, pending, refresh } = useFetch<CrmListResponse<CrmPerson>>(`${base}/people`, {
    query,
    watch: [query],
    immediate: false,
    default: () => ({ items: [], total: 0, page: 1, page_size: 50 }),
  })
  watch(clientId, (v) => { if (v) refresh() }, { immediate: true })

  async function create(body: Partial<CrmPerson>) {
    const res = await $fetch<{ item: CrmPerson }>(`${base}/people`, { method: 'POST', body: { ...body, client_id: clientId.value } })
    await refresh()
    return res.item
  }
  async function update(id: string, body: Partial<CrmPerson>) {
    const res = await $fetch<{ item: CrmPerson }>(`${base}/people/${id}`, { method: 'PATCH', body: { ...body, client_id: clientId.value } })
    await refresh()
    return res.item
  }
  async function remove(id: string) {
    await $fetch(`${base}/people/${id}`, { method: 'DELETE', query: { client_id: clientId.value } })
    await refresh()
  }
  async function importCsv(csv: string) {
    const res = await $fetch<{ imported: number, skipped: number, errors: { row: number, message: string }[] }>(
      `${base}/people/import`, { method: 'POST', body: { client_id: clientId.value, csv } },
    )
    await refresh()
    return res
  }
  return { data, pending, refresh, search, companyId, lifecycle, tag, page, create, update, remove, importCsv }
}
