import { onScopeDispose, ref, watch, type Ref } from 'vue'
import type { SocialCampaignWithCounts } from '~/types'

/** Clear when leaving a resolved client; ignore late responses from earlier clients. */
export function useComposerCampaigns(
  clientId: () => string | null,
  selected: Ref<string | null>,
  list: (clientId: string) => Promise<SocialCampaignWithCounts[]>
) {
  const campaigns = ref<SocialCampaignWithCounts[]>([])
  const loading = ref(false)
  const failed = ref(false)
  let revision = 0
  async function reload() {
    const request = ++revision
    const client = clientId()
    campaigns.value = []
    failed.value = false
    loading.value = Boolean(client)
    if (!client) return
    try {
      const rows = await list(client)
      if (request === revision) campaigns.value = rows
    } catch {
      if (request === revision) failed.value = true
    } finally {
      if (request === revision) loading.value = false
    }
  }
  watch(clientId, (_next, previous) => {
    // Initial client-list loading may resolve after a saved post has hydrated.
    // Losing/changing a known client still clears selection immediately.
    if (previous != null) selected.value = null
    void reload()
  }, { immediate: true, flush: 'sync' })
  onScopeDispose(() => {
    revision++
  })
  return { campaigns, loading, failed, reload }
}
