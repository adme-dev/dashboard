export function useMetaConnect(opts: { onConnected?: () => Promise<void> | void }) {
  const { onConnected } = opts
  const state = reactive({ status: 'idle' as 'idle' | 'loading' | 'completed' | 'error', error: '' })
  const apiFetch = $fetch as <T = unknown>(request: string) => Promise<T>
  let popup: Window | null = null
  let pollTimer: ReturnType<typeof setInterval> | null = null

  function openPopup(url: string) {
    const width = 600
    const height = 700
    const left = window.screenX + (window.outerWidth - width) / 2
    const top = window.screenY + (window.outerHeight - height) / 2
    return window.open(url, 'meta-oauth', `width=${width},height=${height},left=${left},top=${top}`)
  }

  function stopPolling() {
    if (pollTimer) {
      clearInterval(pollTimer)
      pollTimer = null
    }
  }

  async function startConnect(intent: 'connection' | 'catalog_management') {
    // Reserve the popup synchronously while the browser still considers this
    // call part of the user's click. Opening it after the API round trip is
    // blocked or ignored by some browsers, leaving no OAuth callback.
    popup = openPopup('about:blank')

    try {
      state.status = 'loading'
      state.error = ''

      const endpoint = intent === 'catalog_management'
        ? '/api/agency/social/meta/connect?intent=catalog_management'
        : '/api/agency/social/meta/connect'
      const { url } = await apiFetch<{ url: string }>(endpoint)

      if (!popup) {
        // Fallback: redirect in same tab
        window.location.href = url
        return
      }

      popup.location.replace(url)

      // Poll for popup close — callback redirects to /settings?tab=social&connected=meta
      // which means the popup will eventually land on our app and close or be closeable
      stopPolling()
      pollTimer = setInterval(async () => {
        if (popup && popup.closed) {
          stopPolling()
          // Popup closed — check if accounts were connected
          try {
            const accounts = await apiFetch<unknown[]>('/api/agency/social/meta/accounts')
            if (accounts && accounts.length > 0) {
              state.status = 'completed'
              await onConnected?.()
            } else {
              state.status = 'idle'
            }
          } catch {
            state.status = 'idle'
          }
        }
      }, 500)
    } catch (error: unknown) {
      if (popup && !popup.closed) popup.close()
      popup = null
      const err = error as { data?: { statusMessage?: string }, message?: string }
      state.status = 'error'
      state.error = err?.data?.statusMessage || err?.message || 'Unable to start Meta connection.'
    }
  }

  async function connect() {
    return startConnect('connection')
  }

  async function connectWithIntent(intent: 'connection' | 'catalog_management') {
    return startConnect(intent)
  }

  if (import.meta.client) {
    onBeforeUnmount(() => {
      stopPolling()
    })
  }

  return { state, connect, connectWithIntent }
}
