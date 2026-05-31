// app/composables/useCrmOpportunities.ts
import type { CrmOpportunity, CrmListResponse } from '~/types/crm'

export function useCrmOpportunities(clientId: Ref<string | null>) {
  const query = computed(() => {
    const p: Record<string, string> = { page: '1', page_size: '500' }
    if (clientId.value) p.client_id = clientId.value
    return p
  })
  const { data, pending, refresh } = useFetch<CrmListResponse<CrmOpportunity>>('/api/crm/opportunities', {
    query,
    watch: [query],
    immediate: false,
    default: () => ({ items: [], total: 0, page: 1, page_size: 500 }),
  })
  watch(clientId, (v) => { if (v) refresh() }, { immediate: true })

  async function create(body: Partial<CrmOpportunity>) {
    const r = await $fetch<{ item: CrmOpportunity }>('/api/crm/opportunities', { method: 'POST', body: { ...body, client_id: clientId.value } })
    await refresh()
    return r.item
  }
  async function update(id: string, body: Partial<CrmOpportunity>) {
    const r = await $fetch<{ item: CrmOpportunity }>(`/api/crm/opportunities/${id}`, { method: 'PATCH', body: { ...body, client_id: clientId.value } })
    await refresh()
    return r.item
  }
  async function move(id: string, stageId: string) {
    const r = await $fetch<{ item: CrmOpportunity }>(`/api/crm/opportunities/${id}/move`, { method: 'PATCH', body: { client_id: clientId.value, stage_id: stageId } })
    return r.item
  }
  async function remove(id: string) {
    await $fetch(`/api/crm/opportunities/${id}`, { method: 'DELETE', query: { client_id: clientId.value } })
    await refresh()
  }
  return { data, pending, refresh, create, update, move, remove }
}
