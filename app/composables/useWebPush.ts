/**
 * Web Push client helper.
 *
 * Wraps service worker registration, browser push subscription, and the
 * round trip with /api/notifications/push/* endpoints.
 *
 * Usage:
 *   const { isSupported, permission, isSubscribed, enable, disable } = useWebPush()
 *   await enable()  // prompts for permission, registers SW, subscribes
 */

interface UseWebPushReturn {
  isSupported: ComputedRef<boolean>
  permission: Ref<NotificationPermission | 'unsupported'>
  isSubscribed: Ref<boolean>
  isBusy: Ref<boolean>
  enable: () => Promise<{ ok: boolean; reason?: string }>
  disable: () => Promise<{ ok: boolean }>
  refresh: () => Promise<void>
}

export function useWebPush(): UseWebPushReturn {
  const permission = ref<NotificationPermission | 'unsupported'>('default')
  const isSubscribed = ref(false)
  const isBusy = ref(false)

  const isSupported = computed(() => {
    if (!import.meta.client) return false
    return (
      'serviceWorker' in navigator &&
      'PushManager' in window &&
      'Notification' in window
    )
  })

  async function refresh(): Promise<void> {
    if (!isSupported.value) {
      permission.value = 'unsupported'
      isSubscribed.value = false
      return
    }
    permission.value = Notification.permission
    try {
      const reg = await navigator.serviceWorker.getRegistration('/')
      if (!reg) {
        isSubscribed.value = false
        return
      }
      const sub = await reg.pushManager.getSubscription()
      isSubscribed.value = !!sub
    } catch {
      isSubscribed.value = false
    }
  }

  async function enable(): Promise<{ ok: boolean; reason?: string }> {
    if (!isSupported.value) return { ok: false, reason: 'unsupported' }
    if (isBusy.value) return { ok: false, reason: 'busy' }
    isBusy.value = true
    try {
      // 1. Request permission (no-op if already granted).
      if (Notification.permission !== 'granted') {
        const result = await Notification.requestPermission()
        permission.value = result
        if (result !== 'granted') return { ok: false, reason: 'permission_denied' }
      }

      // 2. Register the service worker (idempotent).
      const reg =
        (await navigator.serviceWorker.getRegistration('/')) ||
        (await navigator.serviceWorker.register('/sw.js', { scope: '/' }))
      await navigator.serviceWorker.ready

      // 3. Fetch the VAPID public key from the server.
      const { publicKey } = await $fetch<{ publicKey: string }>(
        '/api/notifications/push/vapid-key'
      )

      // 4. Subscribe via PushManager. Reuses an existing subscription if present.
      let sub = await reg.pushManager.getSubscription()
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        })
      }

      // 5. Send the subscription up to the server.
      const json = sub.toJSON()
      await $fetch('/api/notifications/push/subscribe', {
        method: 'POST',
        body: {
          endpoint: json.endpoint,
          keys: json.keys,
        },
      })

      isSubscribed.value = true
      return { ok: true }
    } catch (err) {
      console.error('[useWebPush] enable failed:', err)
      return { ok: false, reason: 'error' }
    } finally {
      isBusy.value = false
    }
  }

  async function disable(): Promise<{ ok: boolean }> {
    if (!isSupported.value) return { ok: true }
    if (isBusy.value) return { ok: false }
    isBusy.value = true
    try {
      const reg = await navigator.serviceWorker.getRegistration('/')
      const sub = reg ? await reg.pushManager.getSubscription() : null
      if (sub) {
        const endpoint = sub.endpoint
        try {
          await sub.unsubscribe()
        } catch (err) {
          console.warn('[useWebPush] browser unsubscribe failed:', err)
        }
        try {
          await $fetch('/api/notifications/push/unsubscribe', {
            method: 'DELETE',
            body: { endpoint },
          })
        } catch (err) {
          console.warn('[useWebPush] server unsubscribe failed:', err)
        }
      }
      isSubscribed.value = false
      return { ok: true }
    } finally {
      isBusy.value = false
    }
  }

  // Sync state on mount when used in a component.
  if (import.meta.client) {
    onMounted(() => {
      refresh()
    })
  }

  return { isSupported, permission, isSubscribed, isBusy, enable, disable, refresh }
}

/**
 * Convert the server's base64url public key into the Uint8Array
 * PushManager.subscribe wants as `applicationServerKey`.
 */
function urlBase64ToUint8Array(base64Url: string): Uint8Array {
  const padding = '='.repeat((4 - (base64Url.length % 4)) % 4)
  const base64 = (base64Url + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}
