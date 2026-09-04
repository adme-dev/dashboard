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

  async function connect(intent: 'baseline' | 'catalog' = 'baseline') {
    try {
      state.status = 'loading'
      state.error = ''

      const { url } = await apiFetch<{ url: string }>(
        `/api/agency/social/meta/connect?intent=${encodeURIComponent(intent)}`,
      )
      popup = openPopup(url)

      if (!popup) {
        // Fallback: redirect in same tab
        window.location.href = url
        return
      }

      // Poll for popup close — callback redirects to /settings?tab=social&connected=meta
      // which means the popup will eventually land on our app and close or be closeable
      stopPolling()
      pollTimer = setInterval(async () => {
        if (popup && popup.closed) {
          stopPolling()
          // Popup closed — check if accounts were connected
          try {
            const accounts = await apiFetch<any[]>('/api/agency/social/meta/accounts')
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
    } catch (err: any) {
      state.status = 'error'
      state.error = err?.data?.statusMessage || err?.message || 'Unable to start Meta connection.'
    }
  }

  if (import.meta.client) {
    onBeforeUnmount(() => {
      stopPolling()
    })
  }

  return { state, connect }
}
