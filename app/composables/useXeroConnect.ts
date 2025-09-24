import type { Ref } from 'vue'

export function useXeroConnect(opts: { onStatusRefresh?: () => Promise<void> | void }) {
  const { onStatusRefresh } = opts
  const state = reactive({ status: 'idle' as 'idle' | 'loading' | 'completed' | 'error', error: '' })
  let popup: Window | null = null

  function openPopup(url: string) {
    const width = 540
    const height = 680
    const left = window.screenX + (window.outerWidth - width) / 2
    const top = window.screenY + (window.outerHeight - height) / 2
    return window.open(url, 'xero-oauth', `width=${width},height=${height},left=${left},top=${top}`)
  }

  async function connect() {
    try {
      state.status = 'loading'
      state.error = ''
      popup = openPopup('/api/xero/login?mode=popup')

      if (!popup) {
        window.location.href = '/api/xero/login'
        return
      }
    } catch (err: any) {
      state.status = 'error'
      state.error = err?.message || 'Unable to open Xero login popup.'
    }
  }

  function handleMessage(event: MessageEvent) {
    if (event.data?.type === 'xero-connected') {
      state.status = 'completed'
      if (popup && !popup.closed) {
        popup.close()
      }
      onStatusRefresh?.()
    }
  }

  if (process.client) {
    window.addEventListener('message', handleMessage)
    onBeforeUnmount(() => {
      window.removeEventListener('message', handleMessage)
    })
  }

  return { state, connect }
}

