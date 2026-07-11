// app/composables/useCrmViews.ts
// F9 — saved views for a client+entity. Works on agency + portal via crmApiBase;
// client_id is sent (portal ignores it and scopes by session).
import type { CrmEntity, CrmView } from '~/types/crm'

export function useCrmViews(clientId: Ref<string | null>, entity: CrmEntity) {
  const base = inject<string>('crmApiBase', '/api/crm')
  const apiFetch = $fetch as <T = unknown>(
    request: string,
    options?: {
      method?: string
      body?: unknown
      query?: Record<string, unknown>
    }
  ) => Promise<T>

  const query = computed(() => ({ client_id: clientId.value ?? '', entity }))
  const enabled = computed(() => !!clientId.value)
  const data = ref<{ items: CrmView[] }>({ items: [] })
  const pending = ref(false)

  async function refresh() {
    if (!enabled.value) {
      data.value = { items: [] }
      return
    }

    pending.value = true
    try {
      data.value = await apiFetch<{ items: CrmView[] }>(`${base}/views`, { query: query.value })
    } finally {
      pending.value = false
    }
  }

  watch(enabled, (v) => { if (v) refresh() }, { immediate: true })

  async function save(body: { name: string, filters: unknown, columns?: string[], is_shared?: boolean }) {
    const created = await apiFetch<CrmView>(`${base}/views`, {
      method: 'POST',
      body: { ...body, entity, client_id: clientId.value },
    })
    await refresh()
    return created
  }
  async function update(id: string, patch: Partial<Pick<CrmView, 'name' | 'filters' | 'columns' | 'is_shared'>>) {
    await apiFetch(`${base}/views/${id}`, { method: 'PATCH', body: { ...patch, client_id: clientId.value } })
    await refresh()
  }
  async function remove(id: string) {
    await apiFetch(`${base}/views/${id}`, { method: 'DELETE', query: { client_id: clientId.value } })
    await refresh()
  }

  return {
    views: computed(() => data.value?.items ?? []),
    pending,
    refresh,
    save,
    update,
    remove,
  }
}
