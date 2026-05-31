// app/composables/useCrmActivities.ts
import type { CrmActivity } from '~/types/crm'

export function useCrmActivities(
  clientId: Ref<string | null>,
  targetType: 'person' | 'company' | 'opportunity',
  targetId: Ref<string | null>,
) {
  const base = inject<string>('crmApiBase', '/api/crm')
  const query = computed(() => ({ client_id: clientId.value ?? '', target_type: targetType, target_id: targetId.value ?? '' }))
  const enabled = computed(() => !!clientId.value && !!targetId.value)
  const { data, pending, refresh } = useFetch<{ items: CrmActivity[] }>(`${base}/activities`, {
    query,
    watch: [query],
    immediate: false,
    default: () => ({ items: [] }),
  })
  watch(enabled, (v) => { if (v) refresh() }, { immediate: true })

  async function create(body: Partial<CrmActivity>) {
    await $fetch(`${base}/activities`, {
      method: 'POST',
      body: { ...body, client_id: clientId.value, target_type: targetType, target_id: targetId.value },
    })
    await refresh()
  }
  async function toggle(id: string, is_completed: boolean) {
    await $fetch(`${base}/activities/${id}`, { method: 'PATCH', body: { client_id: clientId.value, is_completed } })
    await refresh()
  }
  async function remove(id: string) {
    await $fetch(`${base}/activities/${id}`, { method: 'DELETE', query: { client_id: clientId.value } })
    await refresh()
  }
  return { activities: computed(() => data.value?.items ?? []), pending, refresh, create, toggle, remove }
}
