// app/composables/useCrmTasks.ts
// Works in both the agency surface (provide 'crmApiBase' = '/api/crm') and the
// client portal ('/api/client-portal/crm'). client_id is always sent; portal
// endpoints ignore it and scope by session.
import type { CrmTask, CrmTaskFilters } from '~/types/crm'

export function useCrmTasks(
  clientId: Ref<string | null>,
  filters: Ref<CrmTaskFilters> = ref({}),
) {
  const base = inject<string>('crmApiBase', '/api/crm')
  const apiFetch = $fetch as <T = unknown>(
    request: string,
    options?: {
      method?: string
      body?: unknown
      query?: Record<string, unknown>
    }
  ) => Promise<T>

  const query = computed(() => {
    const f = filters.value
    const q: Record<string, string | number> = { client_id: clientId.value ?? '' }
    for (const [k, v] of Object.entries(f)) {
      if (v !== undefined && v !== null && v !== '' && v !== 'all') q[k] = v as string | number
    }
    return q
  })
  const enabled = computed(() => !!clientId.value)
  const data = ref<{ items: CrmTask[], total: number }>({ items: [], total: 0 })
  const pending = ref(false)

  async function refresh() {
    if (!enabled.value) {
      data.value = { items: [], total: 0 }
      return
    }

    pending.value = true
    try {
      data.value = await apiFetch<{ items: CrmTask[], total: number }>(`${base}/tasks`, { query: query.value })
    } finally {
      pending.value = false
    }
  }

  watch(query, () => { refresh() }, { immediate: true })

  async function create(body: Partial<CrmTask>) {
    await apiFetch(`${base}/tasks`, { method: 'POST', body: { ...body, client_id: clientId.value } })
    await refresh()
  }
  async function update(id: string, patch: Partial<CrmTask>) {
    await apiFetch(`${base}/tasks/${id}`, { method: 'PATCH', body: { ...patch, client_id: clientId.value } })
    await refresh()
  }
  async function complete(id: string, outcome?: string | null) {
    await update(id, { status: 'completed', outcome: (outcome ?? null) as CrmTask['outcome'] })
  }
  async function remove(id: string) {
    await apiFetch(`${base}/tasks/${id}`, { method: 'DELETE', query: { client_id: clientId.value } })
    await refresh()
  }

  return {
    tasks: computed(() => data.value?.items ?? []),
    total: computed(() => data.value?.total ?? 0),
    pending,
    refresh,
    create,
    update,
    complete,
    remove,
  }
}
