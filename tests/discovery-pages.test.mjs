import assert from 'node:assert/strict'
import { access, readFile } from 'node:fs/promises'
import test from 'node:test'
import vm from 'node:vm'

async function text(path) { return readFile(new URL(path, import.meta.url), 'utf8') }

test('About remains consolidated and discovery pages are static, canonical HTML entries', async () => {
  await assert.rejects(access(new URL('../public/about/index.html', import.meta.url)))
  const pages = [
    ['../rain-sounds/index.html', 'https://thisquiet.world/rain-sounds/', 'Rain Sounds for Sleep — Black Screen'],
    ['../bedside-clock/index.html', 'https://thisquiet.world/bedside-clock/', 'Black Screen With Clock'],
    ['../black-screen/index.html', 'https://thisquiet.world/black-screen/', 'Black Screen'],
    ['../black-screen-for-sleep/index.html', 'https://thisquiet.world/black-screen-for-sleep/', 'Black Screen for Sleep'],
    ['../sleep-tools/index.html', 'https://thisquiet.world/sleep-tools/', 'Free Sleep Tools — Black Screen, Rain Sounds, Sleep Timer & Night Clock'],
    ['../sleep-timer/index.html', 'https://thisquiet.world/sleep-timer/', 'Online Sleep Timer for Rain & Ambient Sounds'],
  ]
  const titles = new Set()
  const descriptions = new Set()
  for (const [path, canonical, heading] of pages) {
    const html = await text(path)
    assert.match(html, new RegExp(`<link rel="canonical" href="${canonical.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`))
    assert.match(html, new RegExp(`<h1>${heading.replace('&', '&amp;')}`))
    assert.doesNotMatch(html, /<script[^>]+(?:src=|type=["']module["'])/i, 'informational pages must not boot the app or audio engines')
    assert.match(html, /type="application\/ld\+json"/)
    const title = html.match(/<title>([^<]+)<\/title>/)?.[1]
    const description = html.match(/<meta name="description" content="([^"]+)"/i)?.[1]
    assert.ok(title && description)
    titles.add(title); descriptions.add(description)
  }
  assert.equal(titles.size, pages.length)
  assert.equal(descriptions.size, pages.length)
})

test('discovery links, sitemap, Vite entries and redirects all agree on canonical routes', async () => {
  const [about, sitemap, vite, netlify, rain, bedside, hub, sleepTimer, black, sleepBlack, app] = await Promise.all([
    text('../about/index.html'), text('../public/sitemap.xml'), text('../vite.config.ts'), text('../netlify.toml'),
    text('../rain-sounds/index.html'), text('../bedside-clock/index.html'), text('../sleep-tools/index.html'), text('../sleep-timer/index.html'),
    text('../black-screen/index.html'), text('../black-screen-for-sleep/index.html'), text('../src/App.tsx'),
  ])
  const routes = ['/rain-sounds/', '/bedside-clock/', '/black-screen/', '/black-screen-for-sleep/', '/sleep-tools/', '/sleep-timer/']
  for (const route of routes) assert.ok(sitemap.includes(`https://thisquiet.world${route}`))
  for (const route of ['/rain-sounds/', '/bedside-clock/', '/black-screen/', '/black-screen-for-sleep/', '/sleep-tools/', '/sleep-timer/']) {
    assert.ok(about.includes(`href="${route}"`))
  }
  for (const entry of ['rain-sounds/index.html', 'bedside-clock/index.html', 'black-screen/index.html', 'black-screen-for-sleep/index.html', 'sleep-tools/index.html', 'sleep-timer/index.html']) {
    assert.ok(vite.includes(`'${entry}'`))
  }
  for (const route of ['/rain-sounds', '/bedside-clock', '/black-screen', '/black-screen-for-sleep', '/sleep-tools', '/sleep-timer']) assert.ok(netlify.includes(`from = "${route}"`))
  for (const route of ['/black-screen/', '/black-screen-for-sleep/', '/rain-sounds/', '/bedside-clock/', '/sleep-timer/']) assert.ok(hub.includes(`href="${route}"`))
  assert.ok(app.includes('href="/sleep-tools/"'))
  assert.ok(app.includes("entryMode === 'sleep-timer'"))
  assert.ok(sleepTimer.includes('href="/?entry=sleep-timer"'))
  assert.match(sleepTimer, /30 minutes/)
  assert.match(sleepTimer, /final minute/)
  assert.ok(rain.includes('href="/sleep-timer/"'))
  assert.ok(sleepBlack.includes('href="/sleep-timer/"'))
  assert.ok(rain.includes('href="/?entry=rain"'))
  assert.ok(bedside.includes('href="/?entry=sunrise"'))
  assert.match(rain, /id="rain-audio"/)
  assert.match(rain, /rain-steady-loop\.mp3/)
  assert.match(rain, /rain-heavy-loop\.mp3/)
  assert.match(rain, /id="blackout"/)
  assert.match(bedside, /id="night-clock"/)
  assert.match(bedside, /id="brightness"/)
  assert.match(bedside, /Intl\.DateTimeFormat/)
  assert.ok(netlify.includes('from = "/black-screen-with-clock"'))
  assert.ok(netlify.includes('from = "/night-clock"'))
  assert.match(black, /id="go-black"/)
  assert.match(black, /requestFullscreen/)
  assert.match(black, /navigator\.wakeLock\.request\('screen'\)/)
  assert.match(sleepBlack, /id="with-clock"/)
  assert.match(sleepBlack, /Intl\.DateTimeFormat/)
})

test('service worker gives every static page its own cache key and never falls back to home for those routes', async () => {
  const sw = await text('../public/sw.js')
  for (const route of ['/about/', '/rain-sounds/', '/bedside-clock/', '/sleep-tools/', '/sleep-timer/', '/black-screen/', '/black-screen-for-sleep/']) {
    assert.ok(sw.includes(`['${route}', '${route}']`))
  }
  assert.match(sw, /if \(staticCacheKey\)[\s\S]*status: 503/)
  assert.match(sw, /return caches\.match\('\/index\.html'\)/)
})



test('service worker bypasses sitemap and crawler text files instead of feeding them to the SPA fallback', async () => {
  const sw = await text('../public/sw.js')
  for (const route of ['/sitemap.xml', '/robots.txt', '/llms.txt']) {
    assert.ok(sw.includes(`'${route}'`))
  }
  assert.match(sw, /NETWORK_ONLY_STATIC_PATHS\.has\(url\.pathname\)\) return/)

  const handlers = new Map()
  const context = {
    URL,
    Set,
    Map,
    Promise,
    Response,
    self: {
      location: { origin: 'https://thisquiet.world' },
      addEventListener(type, handler) { handlers.set(type, handler) },
      skipWaiting() { return Promise.resolve() },
      clients: { claim() { return Promise.resolve() } },
    },
    caches: {
      keys: async () => [],
      delete: async () => true,
      match: async () => undefined,
      open: async () => ({ addAll: async () => {}, put: async () => {} }),
    },
    fetch: async () => { throw new Error('worker must not fetch bypassed static endpoints') },
  }
  vm.runInNewContext(sw, context)
  const fetchHandler = handlers.get('fetch')

  for (const route of ['/sitemap.xml', '/robots.txt', '/llms.txt']) {
    let responded = false
    let waited = false
    fetchHandler({
      request: { method: 'GET', mode: 'navigate', url: `https://thisquiet.world${route}` },
      respondWith() { responded = true },
      waitUntil() { waited = true },
    })
    assert.equal(responded, false, `${route} must bypass service-worker response handling`)
    assert.equal(waited, false, `${route} must not be cached by the service worker`)
  }
})

test('slashless static navigations cache under their canonical page key, never /index.html', async () => {
  const sw = await text('../public/sw.js')
  const handlers = new Map()
  const writes = []
  const context = {
    URL,
    Map,
    Promise,
    Response,
    self: {
      location: { origin: 'https://thisquiet.world' },
      addEventListener(type, handler) { handlers.set(type, handler) },
      skipWaiting() { return Promise.resolve() },
      clients: { claim() { return Promise.resolve() } },
    },
    caches: {
      keys: async () => [],
      delete: async () => true,
      match: async () => undefined,
      open: async () => ({
        addAll: async () => {},
        put: async (key) => { writes.push(key) },
      }),
    },
    fetch: async () => new Response('<!doctype html><title>static</title>', {
      status: 200,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    }),
  }
  vm.runInNewContext(sw, context)
  const fetchHandler = handlers.get('fetch')
  assert.equal(typeof fetchHandler, 'function')

  for (const route of ['/about', '/rain-sounds', '/bedside-clock', '/sleep-tools', '/sleep-timer', '/black-screen', '/black-screen-for-sleep']) {
    writes.length = 0
    const waits = []
    let responsePromise
    fetchHandler({
      request: { method: 'GET', mode: 'navigate', url: `https://thisquiet.world${route}` },
      respondWith(value) { responsePromise = value },
      waitUntil(value) { waits.push(value) },
    })
    const response = await responsePromise
    await Promise.all(waits)
    assert.equal(response.status, 200)
    assert.deepEqual(writes, [`${route}/`])
    assert.equal(writes.includes('/index.html'), false)
  }
})

test('control dock keeps keyboard-only focus pinning and sunrise exits stay mounted through fade state', async () => {
  const [css, hook] = await Promise.all([text('../src/App.css'), text('../src/sunrise/useSunriseAlarm.ts')])
  assert.match(css, /\.control-dock:has\(:focus-visible\)/)
  assert.doesNotMatch(css, /\.control-dock:focus-within/)
  assert.match(hook, /type PreviewExit/)
  assert.match(hook, /setPreviewExit\(\{ startedAt: now, fromFraction: 1 \}\)/)
  assert.match(hook, /setRuntime\(makeFinishingRuntime\(current, nowMs, 'cancelled', SUNRISE_CANCEL_FADE_MS\)\)/)
})
