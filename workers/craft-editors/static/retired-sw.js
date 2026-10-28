// XeroFlow: retire only the upstream app-shell cache; preserve OPFS and IndexedDB projects.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', event => event.waitUntil((async () => {
  const keys = await caches.keys()
  await Promise.all(keys.filter(key => key.startsWith('effectcraft-')).map(key => caches.delete(key)))
  await self.clients.claim()
  await self.registration.unregister()
})()))
