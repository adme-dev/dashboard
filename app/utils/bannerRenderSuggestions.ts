export interface BannerRenderSocialSuggestion {
  caption?: string
  suggestedSchedule?: string
}

type StorageAccess = () => Pick<Storage, 'getItem' | 'setItem'>
type Entry = { jobId: string, suggestion: BannerRenderSocialSuggestion }
const MAX_JOBS_PER_PROJECT = 50
const MAX_MEMORY_CONTEXTS = 20

/** Copy only bounded social fields; never retain a reactive modal prop. */
export function snapshotBannerSocialSuggestion(value?: BannerRenderSocialSuggestion): BannerRenderSocialSuggestion {
  return {
    ...(typeof value?.caption === 'string' ? { caption: value.caption.slice(0, 5000) } : {}),
    ...(typeof value?.suggestedSchedule === 'string' ? { suggestedSchedule: value.suggestedSchedule.slice(0, 500) } : {})
  }
}

/**
 * Suggestions belong to a render job, not whichever proposal is currently open.
 * sessionStorage survives component recreation and reload in the same browser
 * tab. It is not cross-device/server persistence; blocked storage falls back to
 * memory until this page reloads. Keep the latest 50 jobs per project/client.
 */
export function createBannerRenderSuggestionStore(storage: StorageAccess = () => globalThis.sessionStorage) {
  const memory = new Map<string, Entry[]>()
  const context = (projectId: string, clientId: string | null | undefined) => `${encodeURIComponent(projectId)}:${encodeURIComponent(clientId || '__unassigned__')}`
  const key = (contextId: string) => `banner-render-suggestions:v2:${contextId}`
  function retain(contextId: string, entries: Entry[]) {
    memory.delete(contextId)
    memory.set(contextId, entries.slice(-MAX_JOBS_PER_PROJECT))
    if (memory.size > MAX_MEMORY_CONTEXTS) memory.delete(memory.keys().next().value!)
  }
  function read(contextId: string): Entry[] {
    const cached = memory.get(contextId)
    if (cached) return cached
    let entries: Entry[] = []
    try {
      const saved: unknown = JSON.parse(storage().getItem(key(contextId)) || 'null')
      if (Array.isArray(saved)) {
        entries = saved.slice(-MAX_JOBS_PER_PROJECT).flatMap((entry) => {
          if (!entry || typeof entry.jobId !== 'string' || entry.jobId.length > 256 || !entry.suggestion || typeof entry.suggestion !== 'object') return []
          return [{ jobId: entry.jobId, suggestion: snapshotBannerSocialSuggestion(entry.suggestion) }]
        })
      }
    } catch { /* Storage may be blocked or malformed; the in-memory store remains usable. */ }
    retain(contextId, entries)
    return entries
  }
  return {
    remember(projectId: string, clientId: string | null | undefined, jobIds: string[], suggestion?: BannerRenderSocialSuggestion) {
      if (!projectId) return
      const contextId = context(projectId, clientId)
      const entries = [...read(contextId)]
      for (const jobId of jobIds.slice(-MAX_JOBS_PER_PROJECT)) {
        // A replayed enqueue response must not replace an older video's copy.
        if (!jobId || jobId.length > 256 || entries.some(entry => entry.jobId === jobId)) continue
        entries.push({ jobId, suggestion: snapshotBannerSocialSuggestion(suggestion) })
      }
      const bounded = entries.slice(-MAX_JOBS_PER_PROJECT)
      retain(contextId, bounded)
      try {
        storage().setItem(key(contextId), JSON.stringify(bounded))
      } catch { /* Retain the memory fallback. */ }
    },
    get(projectId: string, clientId: string | null | undefined, jobId: string): BannerRenderSocialSuggestion | undefined {
      const entry = read(context(projectId, clientId)).find(item => item.jobId === jobId)
      return entry ? snapshotBannerSocialSuggestion(entry.suggestion) : undefined
    }
  }
}

export const bannerRenderSuggestions = createBannerRenderSuggestionStore()
