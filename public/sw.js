const CACHE_NAME = 'this-quiet-world-v1.65.4-local-moon'
const APP_SHELL = ['/', '/index.html', '/about/', '/manifest.webmanifest', '/favicon.svg', '/icon-192.png', '/icon-512.png', '/moon-texture.png', '/moon-realistic.webp']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  )
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
    const network = fetch(request)

    const cacheWork = network
      .then((response) => {
        const contentType = response.headers.get('content-type') || ''
        if (!response.ok || !contentType.includes('text/html')) return
        const copy = response.clone()
        return caches.open(CACHE_NAME)
          .then((cache) => cache.put(cacheKey, copy))
          .catch(() => undefined)
      })
      .catch(() => undefined)

    const handled = network
      .then((response) => {
        const contentType = response.headers.get('content-type') || ''
        if (!response.ok || !contentType.includes('text/html')) throw new Error('invalid navigation response')
        return response
      })
      .catch(async () => {
        const cached = await caches.match(cacheKey)
        return cached || caches.match('/index.html')
      })

    event.respondWith(handled)
    event.waitUntil(cacheWork)
    return
  }

  let network = null
  const getNetwork = () => {
    if (!network) network = fetch(request)
    return network
  }
  const cached = caches.match(request).catch(() => undefined)

  const cacheWork = cached
    .then((match) => {
      if (match) return
      return getNetwork().then((response) => {
        if (!response.ok) return
        const copy = response.clone()
        return caches.open(CACHE_NAME)
          .then((cache) => cache.put(request, copy))
          .catch(() => undefined)
      })
    })
    .catch(() => undefined)

  const handled = cached.then((match) => match || getNetwork())

  event.respondWith(handled)
  event.waitUntil(cacheWork)
})
