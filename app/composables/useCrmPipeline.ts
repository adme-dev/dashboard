// app/composables/useCrmPipeline.ts
import type { CrmPipelineSummary } from '~/types/crm'

export function useCrmPipeline(clientId: Ref<string | null>) {
  const base = inject<string>('crmApiBase', '/api/crm')
  const query = computed(() => ({ client_id: clientId.value ?? '' }))
  const { data, refresh } = useFetch<CrmPipelineSummary>(`${base}/pipeline`, {
    query,
    watch: [query],
    immediate: false,
    default: () => ({ byStage: {}, openTotal: 0, weightedTotal: 0 }),
  })
  watch(clientId, (v) => { if (v) refresh() }, { immediate: true })
  return { summary: data, refresh }
}
