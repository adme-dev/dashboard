// app/composables/useSocialListening.ts
import type { Ref } from 'vue'

export interface ListeningQuery {
  id: string
  client_id: string
  name: string
  include_terms: string[]
  exclude_terms: string[]
  sources: string[]
  category: string | null
  enabled: boolean
  created_at: string
  updated_at: string
}

export interface ListeningQueryInput {
  name: string
  includeTerms: string[]
  excludeTerms: string[]
  sources: string[]
  category: string | null
  enabled: boolean
}

const QBASE = '/api/agency/social/listening/queries'

export function useSocialListening(clientId: Ref<string | null>) {
  const apiFetch = $fetch as <T = unknown>(request: string, options?: {
    method?: string
    body?: unknown
    query?: Record<string, unknown>
  }) => Promise<T>
  const queries = ref<ListeningQuery[]>([])
  const mentions = ref<any[]>([])
  const loading = ref(false)
  const filterSource = ref('all')
  const filterSentiment = ref('all')
  const overview = ref<any | null>(null)
  const days = ref(30)

  async function loadQueries() {
    if (!clientId.value) { queries.value = []; return }
    queries.value = await apiFetch<ListeningQuery[]>(QBASE, { query: { clientId: clientId.value } })
  }

  async function loadMentions() {
    if (!clientId.value) { mentions.value = []; return }
    const query: Record<string, any> = { clientId: clientId.value, limit: 100 }
    if (filterSource.value !== 'all') query.source = filterSource.value
    if (filterSentiment.value !== 'all') query.sentiment = filterSentiment.value
    mentions.value = await apiFetch<any[]>('/api/agency/social/listening/mentions', { query })
  }

  async function loadOverview() {
    if (!clientId.value) { overview.value = null; return }
    overview.value = await apiFetch<any>('/api/agency/social/listening/overview', { query: { clientId: clientId.value, days: days.value } })
  }

  async function load() {
    if (!clientId.value) { queries.value = []; mentions.value = []; overview.value = null; return }
    loading.value = true
    try { await Promise.all([loadQueries(), loadMentions(), loadOverview()]) } finally { loading.value = false }
  }

  async function createQuery(input: ListeningQueryInput) {
    if (!clientId.value) return
    await apiFetch(QBASE, { method: 'POST', body: { clientId: clientId.value, ...input } })
    await loadQueries()
  }
  async function updateQuery(id: string, input: Partial<ListeningQueryInput>) {
    await apiFetch(`${QBASE}/${id}`, { method: 'PATCH', body: input })
    await loadQueries()
  }
  async function removeQuery(id: string) {
    await apiFetch(`${QBASE}/${id}`, { method: 'DELETE' })
    await loadQueries()
  }
  async function syncOwned() {
    if (!clientId.value) return
    await apiFetch('/api/agency/social/listening/sync-owned', { method: 'POST', body: { clientId: clientId.value } })
    await loadMentions()
  }

  return { queries, mentions, loading, filterSource, filterSentiment, overview, days, load, loadQueries, loadMentions, loadOverview, createQuery, updateQuery, removeQuery, syncOwned }
}
