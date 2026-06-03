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
 * useFetch dedupes by URL, so multiple callers share one request.
 */
export function useSpendAlerts() {
  const { data, pending, refresh } = useFetch<{ items: SpendAlert[] }>('/api/agency/social/spend/alerts', {
    default: () => ({ items: [] })
  })

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
