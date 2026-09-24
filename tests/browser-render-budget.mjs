// Run against a production preview on 4173. Optionally compare the original
// build on 4174 with PERF_COMPARE_BASELINE=1. Defaults to Firefox for Pi coverage.
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { firefox, chromium } from 'playwright'
const type = process.argv[2] === 'chromium' ? chromium : firefox
const browser = await type.launch({ headless: true })
await mkdir('.perf-tools', { recursive: true })
const reports = []
const scenarios = [
  ...(process.env.PERF_COMPARE_BASELINE === '1' ? [{ name: 'original-1080', port: 4174 }] : []),
  { name: 'updated-1080', port: 4173 },
  { name: 'arm-4k', port: 4173, arm: true },
  { name: 'low-4k', port: 4173, query: '?quality=low' },
]
try {
  for (const scenario of scenarios) {
    const is4k = scenario.name.endsWith('4k')
    const context = await browser.newContext({
      viewport: is4k ? { width: 3840, height: 2160 } : { width: 1920, height: 1080 },
      serviceWorkers: 'block',
      ...(scenario.arm ? { userAgent: 'Mozilla/5.0 (X11; Linux aarch64; rv:155.0) Gecko/20100101 Firefox/155.0' } : {}),
    })
    await context.addInitScript(() => {
      const counters = new WeakMap()
      window.__snowCounters = () => {
        const canvas = document.querySelectorAll('.world-weather-layer > canvas')[2]
        return counters.get(canvas) ?? { frames: 0, strokes: 0, images: 0 }
      }
      for (const [method, key] of [['clearRect', 'frames'], ['stroke', 'strokes'], ['drawImage', 'images']]) {
        const original = CanvasRenderingContext2D.prototype[method]
        CanvasRenderingContext2D.prototype[method] = function (...args) {
          let counter = counters.get(this.canvas)
          if (!counter) { counter = { frames: 0, strokes: 0, images: 0 }; counters.set(this.canvas, counter) }
          counter[key]++
          return original.apply(this, args)
        }
      }
    })
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.goto(`http://127.0.0.1:${scenario.port}/${scenario.query ?? ''}`)
    await page.getByRole('button', { name: 'Snow scene', exact: true }).click({ force: true })
    await page.waitForTimeout(3500)
    const before = await page.evaluate(() => ({ ...window.__snowCounters(), time: performance.now() }))
    await page.waitForTimeout(3000)
    const after = await page.evaluate(() => ({
      ...window.__snowCounters(), time: performance.now(),
      quality: document.documentElement.dataset.renderQuality,
      pixels: [...document.querySelectorAll('canvas')].reduce((sum, c) => sum + c.width * c.height, 0),
    }))
    const elapsedSeconds = (after.time - before.time) / 1000
    const report = {
      name: scenario.name, quality: after.quality, pixels: after.pixels,
      snowFps: +((after.frames - before.frames) / elapsedSeconds).toFixed(1),
      snowStrokesPerSecond: +((after.strokes - before.strokes) / elapsedSeconds).toFixed(1),
      snowImagesPerFrame: +((after.images - before.images) / (after.frames - before.frames)).toFixed(1),
    }
    assert.ok(after.frames > before.frames, 'snow must keep animating')
    if (scenario.port === 4173) {
      assert.equal(after.strokes - before.strokes, 0, 'visible flakes must use cached sprites')
      assert.ok(report.snowImagesPerFrame > 20, 'snow must remain visibly populated')
      assert.ok(after.pixels <= (scenario.query ? 4_000_000 : scenario.arm ? 8_000_000 : 16_000_000))
      if (scenario.arm || scenario.query) assert.ok(report.snowFps <= 32)
    }
    await page.screenshot({ path: `.perf-tools/${scenario.name}.png` })
    if (scenario.port === 4173) {
      await page.evaluate(() => {
        Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' })
        document.dispatchEvent(new Event('visibilitychange'))
      })
      const hidden = await page.evaluate(() => window.__snowCounters().frames)
      await page.waitForTimeout(400)
      assert.equal(await page.evaluate(() => window.__snowCounters().frames), hidden)
      await page.evaluate(() => { delete document.visibilityState; document.dispatchEvent(new Event('visibilitychange')) })
      await page.waitForTimeout(500)
      assert.ok(await page.evaluate(() => window.__snowCounters().frames) > hidden)
      for (const name of ['Rain scene', 'Ember scene', 'Snow scene', 'Black: clear the visible world to pure black']) {
        await page.mouse.move(20, 20)
        await page.getByRole('button', { name, exact: true }).click({ force: true })
        await page.waitForTimeout(600)
      }
    }
    assert.deepEqual(errors, [])
    reports.push(report)
    console.log(report)
    await context.close()
  }
  await writeFile('.perf-tools/render-budget-results.json', JSON.stringify(reports, null, 2))
} finally { await browser.close() }
