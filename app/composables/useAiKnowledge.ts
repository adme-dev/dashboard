import type { AiKnowledgeArticle, KnowledgeCategory } from '~/types'

export function useAiKnowledge() {
  const articles = ref<(AiKnowledgeArticle & { authorName?: string })[]>([])
  const total = ref(0)
  const loading = ref(false)
  const searchQuery = ref('')
  const activeCategory = ref<KnowledgeCategory | 'all'>('all')
  const offset = ref(0)
  const limit = 20

  async function fetchArticles() {
    loading.value = true
    try {
      const params: Record<string, string> = {
        limit: String(limit),
        offset: String(offset.value),
      }
      if (activeCategory.value !== 'all') {
        params.category = activeCategory.value
      }
      if (searchQuery.value.trim()) {
        params.search = searchQuery.value.trim()
      }

      const data = await $fetch<any>('/api/agency/ai/knowledge', { params })
      articles.value = data.articles
      total.value = data.total
    } catch (err) {
      console.error('Failed to fetch knowledge articles:', err)
    } finally {
      loading.value = false
    }
  }

  async function searchArticles(query: string) {
    if (!query.trim()) {
      return fetchArticles()
    }

    loading.value = true
    try {
      const data = await $fetch<any>('/api/agency/ai/knowledge/search', {
        params: { q: query.trim(), limit: String(limit) },
      })
      articles.value = data.results
      total.value = data.total
    } catch (err) {
      console.error('Failed to search knowledge articles:', err)
    } finally {
      loading.value = false
    }
  }

  async function createArticle(payload: { title: string; content: string; category?: string; tags?: string[] }) {
    const data = await $fetch<any>('/api/agency/ai/knowledge', {
      method: 'POST',
      body: payload,
    })
    articles.value.unshift(data)
    total.value++
    return data
  }

  async function updateArticle(id: string, payload: { title: string; content: string; category?: string; tags?: string[]; isPublished?: boolean }) {
    const data = await $fetch<any>(`/api/agency/ai/knowledge/${id}`, {
      method: 'PUT',
      body: payload,
    })
    const idx = articles.value.findIndex(a => a.id === id)
    if (idx >= 0) {
      articles.value[idx] = data
    }
    return data
  }

  async function deleteArticle(id: string) {
    await $fetch(`/api/agency/ai/knowledge/${id}`, { method: 'DELETE' })
    articles.value = articles.value.filter(a => a.id !== id)
    total.value--
  }

  async function getArticle(id: string) {
    return $fetch<AiKnowledgeArticle & { authorName?: string }>(`/api/agency/ai/knowledge/${id}`)
  }

  function setCategory(cat: KnowledgeCategory | 'all') {
    activeCategory.value = cat
    offset.value = 0
    fetchArticles()
  }

  function nextPage() {
    if (offset.value + limit < total.value) {
      offset.value += limit
      fetchArticles()
    }
  }

  function prevPage() {
    if (offset.value > 0) {
      offset.value = Math.max(0, offset.value - limit)
      fetchArticles()
    }
  }

  return {
    articles,
    total,
    loading,
    searchQuery,
    activeCategory,
    offset,
    limit,
    fetchArticles,
    searchArticles,
    createArticle,
    updateArticle,
    deleteArticle,
    getArticle,
    setCategory,
    nextPage,
    prevPage,
  }
}
