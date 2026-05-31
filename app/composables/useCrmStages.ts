// app/composables/useCrmStages.ts
import type { CrmStage } from '~/types/crm'

export function useCrmStages(clientId: Ref<string | null>) {
  const base = inject<string>('crmApiBase', '/api/crm')
  const query = computed(() => ({ client_id: clientId.value ?? '' }))
  const { data, refresh } = useFetch<{ items: CrmStage[] }>(`${base}/stages`, {
    query,
    watch: [query],
    immediate: false,
    default: () => ({ items: [] }),
  })
  watch(clientId, (v) => { if (v) refresh() }, { immediate: true })
  return { stages: computed(() => data.value?.items ?? []), refresh }
}
