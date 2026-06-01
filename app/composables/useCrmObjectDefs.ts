// app/composables/useCrmObjectDefs.ts
import type { CrmObjectDef } from '~/types/crm'

export function useCrmObjectDefs(clientId: Ref<string | null>) {
  const base = inject<string>('crmApiBase', '/api/crm')
  const query = computed(() => ({ client_id: clientId.value ?? '' }))
  const { data, refresh } = useFetch<{ items: CrmObjectDef[] }>(`${base}/object-defs`, {
    query, watch: [query], immediate: false, default: () => ({ items: [] }),
  })
  watch(clientId, (v) => { if (v) refresh() }, { immediate: true })

  async function create(body: Partial<CrmObjectDef>) {
    await $fetch(`${base}/object-defs`, { method: 'POST', body: { ...body, client_id: clientId.value } })
    await refresh()
  }
  async function update(id: string, body: Partial<CrmObjectDef>) {
    await $fetch(`${base}/object-defs/${id}`, { method: 'PATCH', body: { ...body, client_id: clientId.value } })
    await refresh()
  }
  async function remove(id: string) {
    await $fetch(`${base}/object-defs/${id}`, { method: 'DELETE', query: { client_id: clientId.value } })
    await refresh()
  }
  return { objects: computed(() => data.value?.items ?? []), refresh, create, update, remove }
}
