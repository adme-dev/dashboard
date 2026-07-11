// app/composables/useCrmStages.ts
import type { CrmStage } from '~/types/crm'

export function useCrmStages(clientId: Ref<string | null>) {
  const base = inject<string>('crmApiBase', '/api/crm')
  const apiFetch = $fetch as <T = unknown>(request: string, options?: { query?: Record<string, unknown> }) => Promise<T>
  const query = computed(() => ({ client_id: clientId.value ?? '' }))
  const data = ref<{ items: CrmStage[] }>({ items: [] })

  async function refresh() {
    if (!clientId.value) {
      data.value = { items: [] }
      return
    }

    data.value = await apiFetch<{ items: CrmStage[] }>(`${base}/stages`, { query: query.value })
  }

  watch(clientId, () => { refresh() }, { immediate: true })

  return { stages: computed(() => data.value?.items ?? []), refresh }
}
