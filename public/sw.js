/* XeroFlow Agency service worker — Web Push receiver.
 *
 * Registered from app/composables/useWebPush.ts via the browser's
 * navigator.serviceWorker.register('/sw.js'). Scope: '/'.
 *
 * Receives push messages encrypted by server/utils/webPush.ts and
 * displays them as native OS notifications. Clicking the notification
 * focuses an existing tab on the same origin (or opens a new one)
 * and navigates to the deep-link URL the server included in the
 * payload, if present.
 */

self.addEventListener('install', (event) => {
  // Activate immediately on first install — no waiting for old SW to die.
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  // Take control of all open clients (tabs) right away.
  event.waitUntil(self.clients.claim())
})

self.addEventListener('push', (event) => {
  if (!event.data) return

  let payload = {}
  try {
    payload = event.data.json()
  } catch (_) {
    payload = { title: 'Notification', body: event.data.text() }
  }

  const title = payload.title || 'XeroFlow'
  const options = {
    body: payload.body || '',
    icon: payload.icon || '/favicon.ico',
    badge: '/favicon.ico',
    tag: payload.tag, // collapses repeats of the same kind
    data: { url: payload.url || '/' },
    requireInteraction: false,
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || '/'

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Focus an existing tab on the same origin if one is open.
      for (const client of clientList) {
        try {
          const u = new URL(client.url)
          if (u.origin === self.location.origin) {
            client.focus()
            // Best-effort navigation; some platforms reject cross-page navigate().
            try { client.navigate(url) } catch (_) {}
            return
          }
        } catch (_) {}
      }
      return self.clients.openWindow(url)
    })
  )
})
