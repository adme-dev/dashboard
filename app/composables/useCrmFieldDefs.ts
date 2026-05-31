// app/composables/useCrmFieldDefs.ts
import type { CrmFieldDef } from '~/types/crm'

export function useCrmFieldDefs(clientId: Ref<string | null>, objectDefId: Ref<string | null>) {
  const base = inject<string>('crmApiBase', '/api/crm')
  const query = computed(() => ({ client_id: clientId.value ?? '' }))
  const url = computed(() => `${base}/object-defs/${objectDefId.value}/field-defs`)
  const { data, refresh } = useFetch<{ items: CrmFieldDef[] }>(url, {
    query, watch: [query, objectDefId], immediate: false, default: () => ({ items: [] }),
  })
  watch([clientId, objectDefId], ([c, o]) => { if (c && o) refresh() }, { immediate: true })

  async function create(body: Partial<CrmFieldDef>) {
    await $fetch(`${base}/object-defs/${objectDefId.value}/field-defs`, { method: 'POST', body: { ...body, client_id: clientId.value } })
    await refresh()
  }
  async function update(fid: string, body: Partial<CrmFieldDef>) {
    await $fetch(`${base}/object-defs/${objectDefId.value}/field-defs/${fid}`, { method: 'PATCH', body: { ...body, client_id: clientId.value } })
    await refresh()
  }
  async function remove(fid: string) {
    await $fetch(`${base}/object-defs/${objectDefId.value}/field-defs/${fid}`, { method: 'DELETE', query: { client_id: clientId.value } })
    await refresh()
  }
  return { fields: computed(() => data.value?.items ?? []), refresh, create, update, remove }
}
