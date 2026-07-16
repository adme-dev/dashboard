/**
 * Recover from stale-chunk errors after a deploy.
 *
 * Hashed chunk filenames change every deploy; a browser still running the
 * previous bundle 404s when it lazy-loads a route/component chunk
 * ("Failed to fetch dynamically imported module"). Instead of surfacing
 * the error, land the user on their target route with a fresh document.
 * build-freshness.client.ts handles the polite pre-warning; this is the
 * hard fallback once an import has actually failed.
 */
export default defineNuxtPlugin((nuxtApp) => {
  const RELOADED_KEY = 'chunk-error-reloaded-at'

  function recentlyReloaded(): boolean {
    try {
      const at = Number(sessionStorage.getItem(RELOADED_KEY) || 0)
      return Date.now() - at < 60_000
    } catch {
      return false
    }
  }

  function markReloaded() {
    try {
      sessionStorage.setItem(RELOADED_KEY, String(Date.now()))
    } catch {
      // Ignore — worst case we skip the loop guard.
    }
  }

  function isChunkError(error: unknown): boolean {
    const msg = String((error as any)?.message ?? error ?? '')
    return msg.includes('Failed to fetch dynamically imported module')
      || msg.includes('Importing a module script failed')
      || msg.includes('error loading dynamically imported module')
  }

  // Route-level chunks: reload straight onto the route the user was
  // navigating to.
  const router = useRouter()
  router.onError((error, to) => {
    if (isChunkError(error) && !recentlyReloaded()) {
      markReloaded()
      window.location.href = to.fullPath
    }
  })

  // Non-route chunks (lazy components, defineAsyncComponent).
  nuxtApp.hook('app:chunkError', () => {
    if (!recentlyReloaded()) {
      markReloaded()
      window.location.reload()
    }
  })
})
