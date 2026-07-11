// app/composables/useCrmActivities.ts
import type { CrmActivity } from '~/types/crm'

export function useCrmActivities(
  clientId: Ref<string | null>,
  targetType: 'person' | 'company' | 'opportunity',
  targetId: Ref<string | null>,
) {
  const base = inject<string>('crmApiBase', '/api/crm')
  const apiFetch = $fetch as <T = unknown>(
    request: string,
    options?: { method?: string; body?: unknown; query?: Record<string, unknown> },
  ) => Promise<T>
  const query = computed(() => ({ client_id: clientId.value ?? '', target_type: targetType, target_id: targetId.value ?? '' }))
  const enabled = computed(() => !!clientId.value && !!targetId.value)
  const data = ref<{ items: CrmActivity[] }>({ items: [] })
  const pending = ref(false)

  async function refresh() {
    if (!enabled.value) {
      data.value = { items: [] }
      return
    }

    pending.value = true
    try {
      data.value = await apiFetch<{ items: CrmActivity[] }>(`${base}/activities`, { query: query.value })
    } finally {
      pending.value = false
    }
  }

  watch(query, () => { refresh() }, { immediate: true })

  async function create(body: Partial<CrmActivity>) {
    await apiFetch(`${base}/activities`, {
      method: 'POST',
      body: { ...body, client_id: clientId.value, target_type: targetType, target_id: targetId.value },
    })
    await refresh()
  }
  async function toggle(id: string, is_completed: boolean) {
    await apiFetch(`${base}/activities/${id}`, { method: 'PATCH', body: { client_id: clientId.value, is_completed } })
    await refresh()
  }
  async function remove(id: string) {
    await apiFetch(`${base}/activities/${id}`, { method: 'DELETE', query: { client_id: clientId.value } })
    await refresh()
  }
  return { activities: computed(() => data.value?.items ?? []), pending, refresh, create, toggle, remove }
}
