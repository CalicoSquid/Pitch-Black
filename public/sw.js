const CACHE_NAME = 'this-quiet-world-v1.67.1-static-bypass'
const APP_SHELL = [
  '/',
  '/index.html',
  '/about/',
  '/rain-sounds/',
  '/bedside-clock/',
  '/sleep-tools/',
  '/black-screen/',
  '/black-screen-for-sleep/',
  '/manifest.webmanifest',
  '/favicon.svg',
  '/icon-192.png',
  '/icon-512.png',
  '/moon-texture.png',
  '/moon-realistic.webp',
]

const STATIC_NAVIGATION_CACHE_KEYS = new Map([
  ['/about/', '/about/'],
  ['/rain-sounds/', '/rain-sounds/'],
  ['/bedside-clock/', '/bedside-clock/'],
  ['/sleep-tools/', '/sleep-tools/'],
  ['/black-screen/', '/black-screen/'],
  ['/black-screen-for-sleep/', '/black-screen-for-sleep/'],
])

// These machine-readable files must never be treated as SPA navigations.
// Returning without respondWith() lets the browser/crawler fetch the origin
// response directly, preserving XML/plain-text content types and bodies.
const NETWORK_ONLY_STATIC_PATHS = new Set([
  '/sitemap.xml',
  '/robots.txt',
  '/llms.txt',
])

function normalizeNavigationPath(pathname) {
  if (pathname === '/') return pathname
  if (pathname.endsWith('/index.html')) return pathname.slice(0, -'index.html'.length)
  return pathname.endsWith('/') ? pathname : `${pathname}/`
}

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

  // Do not let the SPA HTML fallback swallow crawler/static endpoints when
  // they are opened directly in a browser under service-worker control.
  if (NETWORK_ONLY_STATIC_PATHS.has(url.pathname)) return

  if (request.mode === 'navigate') {
    const staticCacheKey = STATIC_NAVIGATION_CACHE_KEYS.get(normalizeNavigationPath(url.pathname))
    const cacheKey = staticCacheKey ?? '/index.html'
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
        if (cached) return cached

        // Never turn one of the crawlable static pages into the app homepage.
        // If its own cached HTML is unavailable, fail honestly instead of serving
        // unrelated content under the discovery page's canonical URL.
        if (staticCacheKey) {
          return new Response('This Quiet World page is unavailable offline.', {
            status: 503,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' },
          })
        }
        return caches.match('/index.html')
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
