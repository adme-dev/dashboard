export interface SpendAlert {
  id: string
  severity: string
  title: string
  description: string
  recommendation: string | null
  mediaSpendId: string | null
}

/**
 * Active ad-spend pacing/delivery alerts, indexed by media_spend id so the
 * spend table and per-platform campaign pages can surface them inline.
 */
export function useSpendAlerts() {
  const apiFetch = $fetch as <T = unknown>(request: string) => Promise<T>
  const data = ref<{ items: SpendAlert[] }>({ items: [] })
  const pending = ref(false)

  async function refresh() {
    pending.value = true
    try {
      data.value = await apiFetch<{ items: SpendAlert[] }>('/api/agency/social/spend/alerts')
    } catch {
      data.value = { items: [] }
    } finally {
      pending.value = false
    }
  }

  void refresh()

  const byMediaSpendId = computed(() => {
    const map = new Map<string, SpendAlert[]>()
    for (const a of data.value?.items ?? []) {
      if (!a.mediaSpendId) continue
      const arr = map.get(a.mediaSpendId) ?? []
      arr.push(a)
      map.set(a.mediaSpendId, arr)
    }
    return map
  })

  function alertsFor(spendIds: Array<string | null | undefined> | undefined): SpendAlert[] {
    if (!spendIds?.length) return []
    const out: SpendAlert[] = []
    for (const id of spendIds) {
      if (!id) continue
      const arr = byMediaSpendId.value.get(id)
      if (arr) out.push(...arr)
    }
    return out
  }

  return {
    alerts: computed(() => data.value?.items ?? []),
    byMediaSpendId,
    alertsFor,
    pending,
    refresh
  }
}
