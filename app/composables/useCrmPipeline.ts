// app/composables/useCrmPipeline.ts
import type { CrmPipelineSummary } from '~/types/crm'

export function useCrmPipeline(clientId: Ref<string | null>) {
  const base = inject<string>('crmApiBase', '/api/crm')
  const apiFetch = $fetch as <T = unknown>(
    request: string,
    options?: { query?: Record<string, unknown> }
  ) => Promise<T>

  const data = ref<CrmPipelineSummary>({ byStage: {}, openTotal: 0, weightedTotal: 0 })

  async function refresh() {
    if (!clientId.value) {
      data.value = { byStage: {}, openTotal: 0, weightedTotal: 0 }
      return
    }

    data.value = await apiFetch<CrmPipelineSummary>(`${base}/pipeline`, {
      query: { client_id: clientId.value },
    })
  }

  watch(clientId, (v) => { if (v) refresh() }, { immediate: true })
  return { summary: data, refresh }
}
