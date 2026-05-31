// app/composables/useCrmCompanies.ts
import type { CrmCompany, CrmListResponse } from '~/types/crm'

export function useCrmCompanies(clientId: Ref<string | null>) {
  const search = useState<string>('crm-companies-search', () => '')
  const page = useState<number>('crm-companies-page', () => 1)
  const query = computed(() => {
    const p: Record<string, string> = { page: String(page.value), page_size: '50' }
    if (clientId.value) p.client_id = clientId.value
    if (search.value.trim()) p.q = search.value.trim()
    return p
  })
  const { data, pending, refresh } = useFetch<CrmListResponse<CrmCompany>>('/api/crm/companies', {
    query,
    watch: [query],
    immediate: false,
    default: () => ({ items: [], total: 0, page: 1, page_size: 50 }),
  })
  watch(clientId, (v) => { if (v) refresh() }, { immediate: true })

  async function create(body: Partial<CrmCompany>) {
    const res = await $fetch<{ item: CrmCompany }>('/api/crm/companies', { method: 'POST', body: { ...body, client_id: clientId.value } })
    await refresh()
    return res.item
  }
  async function update(id: string, body: Partial<CrmCompany>) {
    const res = await $fetch<{ item: CrmCompany }>(`/api/crm/companies/${id}`, { method: 'PATCH', body: { ...body, client_id: clientId.value } })
    await refresh()
    return res.item
  }
  async function remove(id: string) {
    await $fetch(`/api/crm/companies/${id}`, { method: 'DELETE', query: { client_id: clientId.value } })
    await refresh()
  }
  return { data, pending, refresh, search, page, create, update, remove }
}
