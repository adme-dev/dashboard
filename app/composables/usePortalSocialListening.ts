// app/composables/usePortalSocialListening.ts
import type { Ref } from 'vue'

export function usePortalSocialListening(days: Ref<number>) {
  const overview = ref<any | null>(null)
  const mentions = ref<any[]>([])
  const loading = ref(false)
  async function load() {
    loading.value = true
    try {
      const [o, m] = await Promise.all([
        $fetch<any>('/api/client-portal/social/listening/overview', { query: { days: days.value } }),
        $fetch<any[]>('/api/client-portal/social/listening/mentions', { query: { limit: 100 } }),
      ])
      overview.value = o; mentions.value = m
    } finally { loading.value = false }
  }
  return { overview, mentions, loading, load }
}
