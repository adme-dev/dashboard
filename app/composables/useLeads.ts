import { ref, computed, watch } from 'vue'
import { DEFAULT_FILTERS, type LeadsListFilters, type LeadsListResponse } from '~/types/leadsUi'

export function useLeads() {
  const filters = ref<LeadsListFilters>({ ...DEFAULT_FILTERS })
  const page = ref(1)
  const pageSize = ref(50)

  const params = computed(() => {
    const p: Record<string, string> = { page: String(page.value), page_size: String(pageSize.value) }
    const f = filters.value
    if (f.client_id) p.client_id = f.client_id
    if (f.unmapped) p.unmapped = 'true'
    if (f.source) p.source = f.source
    if (f.form_id) p.form_id = f.form_id
    if (f.status) p.status = f.status
    if (f.assigned_to) p.assigned_to = f.assigned_to
    if (f.q) p.q = f.q
    if (f.from) p.from = f.from
    if (f.to) p.to = f.to
    if (f.include_test) p.include_test = 'true'
    return p
  })

  const { data, pending, refresh, error } = useFetch<LeadsListResponse>('/api/leads/list', {
    query: params,
    watch: [params],
    default: () => ({ items: [], total: 0, page: 1, page_size: 50 }),
  })

  function reset() {
    filters.value = { ...DEFAULT_FILTERS }
    page.value = 1
  }

  // Reset to first page when filters change.
  watch(filters, () => { page.value = 1 }, { deep: true })

  return { filters, page, pageSize, data, pending, error, refresh, reset }
}
