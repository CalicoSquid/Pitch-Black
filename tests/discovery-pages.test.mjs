import assert from 'node:assert/strict'
import { access, readFile } from 'node:fs/promises'
import test from 'node:test'
import vm from 'node:vm'

async function text(path) { return readFile(new URL(path, import.meta.url), 'utf8') }

test('About remains consolidated and discovery pages are static, canonical HTML entries', async () => {
  await assert.rejects(access(new URL('../public/about/index.html', import.meta.url)))
  const pages = [
    ['../rain-sounds/index.html', 'https://thisquiet.world/rain-sounds/', 'Rain Sounds for Sleep with a Dark Screen'],
    ['../bedside-clock/index.html', 'https://thisquiet.world/bedside-clock/', 'A Dim Bedside Clock & Sunrise Wake-Up'],
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
  assert.equal(titles.size, 2)
  assert.equal(descriptions.size, 2)
})

test('discovery links, sitemap, Vite entries and redirects all agree on canonical routes', async () => {
  const [about, sitemap, vite, netlify, rain, bedside] = await Promise.all([
    text('../about/index.html'), text('../public/sitemap.xml'), text('../vite.config.ts'), text('../netlify.toml'),
    text('../rain-sounds/index.html'), text('../bedside-clock/index.html'),
  ])
  for (const route of ['/rain-sounds/', '/bedside-clock/']) {
    assert.ok(about.includes(`href="${route}"`))
    assert.ok(sitemap.includes(`https://thisquiet.world${route}`))
  }
  assert.ok(vite.includes("'rain-sounds/index.html'"))
  assert.ok(vite.includes("'bedside-clock/index.html'"))
  assert.ok(netlify.includes('from = "/rain-sounds"'))
  assert.ok(netlify.includes('from = "/bedside-clock"'))
  assert.ok(rain.includes('href="/?entry=rain"'))
  assert.ok(bedside.includes('href="/?entry=clock"'))
  assert.ok(bedside.includes('href="/?entry=sunrise"'))
})

test('service worker gives every static page its own cache key and never falls back to home for those routes', async () => {
  const sw = await text('../public/sw.js')
  for (const route of ['/about/', '/rain-sounds/', '/bedside-clock/']) {
    assert.ok(sw.includes(`['${route}', '${route}']`))
  }
  assert.match(sw, /if \(staticCacheKey\)[\s\S]*status: 503/)
  assert.match(sw, /return caches\.match\('\/index\.html'\)/)
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

  for (const route of ['/about', '/rain-sounds', '/bedside-clock']) {
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
