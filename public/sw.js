const CACHE_NAME = 'this-quiet-world-v1.65.0-consistency'
const APP_SHELL = ['/', '/index.html', '/about/', '/manifest.webmanifest', '/favicon.svg', '/icon-192.png', '/icon-512.png']

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)))
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))),
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  // Vite development modules must always come directly from the dev server.
  // A worker registered by a previous local production preview can otherwise
  // keep serving stale /src modules even after Vite has restarted.
  if (url.pathname.startsWith('/src/') || url.pathname.startsWith('/@') || url.pathname.startsWith('/node_modules/.vite/')) return

  if (request.mode === 'navigate') {
    const isAbout = url.pathname === '/about/' || url.pathname === '/about/index.html'
    const cacheKey = isAbout ? '/about/' : '/index.html'
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(cacheKey, copy))
          return response
        })
        .catch(() => caches.match(cacheKey).then((cached) => cached || caches.match('/index.html'))),
    )
    return
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached
      return fetch(request).then((response) => {
        if (response.ok) {
          const copy = response.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy))
        }
        return response
      })
    }),
  )
})
