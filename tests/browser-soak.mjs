import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { chromium } from '../.perf-tools/node_modules/playwright/index.mjs'
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE, args: ['--autoplay-policy=no-user-gesture-required'] })
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, serviceWorkers: 'block' })
await context.addInitScript(() => {
  window.__live = 0
  window.__contexts = []
  const Base = AudioContext
  const create = Base.prototype.createBufferSource
  Base.prototype.createBufferSource = function () {
    const source = create.call(this)
    const start = source.start
    source.start = function (...args) {
      window.__live++
      source.addEventListener('ended', () => window.__live--, { once: true })
      return start.apply(this, args)
    }
    return source
  }
  window.AudioContext = class extends Base { constructor(...args) { super(...args); window.__contexts.push(this) } }
})
const page = await context.newPage()
const errors = []
page.on('pageerror', e => errors.push(e.message))
const cdp = await context.newCDPSession(page)
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
const samples = []
const click = async (name) => {
  await page.mouse.move(30, 30)
  await page.getByRole('button', { name, exact: true }).click({ force: true })
}
try {
  await page.goto('http://127.0.0.1:4173/')
  await click('Black: clear the visible world to pure black')
  await click('Enable all sound')
  for (let cycle = 0; cycle < 12; cycle++) {
    await click('Rain scene')
    await page.waitForTimeout(700)
    await click('Snow scene')
    await page.waitForTimeout(700)
    await click('Toggle storm layer')
    await page.waitForTimeout(300)
    await click('Toggle storm layer')
    await click('Black: clear the visible world to pure black')
    await click('Mute all sound')
    await page.waitForTimeout(4000)
    assert.equal(await page.evaluate(() => window.__live), 0, `sources leaked after cycle ${cycle}`)
    await click('Enable all sound')
    if (cycle % 3 === 2) {
      await cdp.send('HeapProfiler.collectGarbage')
      const heap = await cdp.send('Runtime.getHeapUsage')
      samples.push({ cycle, usedMiB: +(heap.usedSize / 1048576).toFixed(2), liveSources: await page.evaluate(() => window.__live) })
      console.log(samples.at(-1))
    }
  }
  // Exercise the actual visibility handlers with synthetic visibility transitions.
  await click('Rain scene')
  await page.waitForTimeout(1500)
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await page.waitForTimeout(500)
  assert.ok(await page.evaluate(() => window.__contexts.every(c => c.state === 'suspended')))
  await page.evaluate(() => {
    delete document.visibilityState
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await page.waitForTimeout(2000)
  assert.ok(await page.evaluate(() => window.__contexts.every(c => c.state === 'running')))
  await click('Mute all sound')
  await page.waitForTimeout(2000)
  assert.equal(await page.evaluate(() => window.__live), 0)
  assert.deepEqual(errors, [])
  // Post-warmup growth allowance includes engine caches; a leak must not grow per cycle.
  assert.ok(samples.at(-1).usedMiB - samples[0].usedMiB < 8, 'heap grew materially across scene/mute cycles')
  await writeFile('.perf-tools/soak-results.json', JSON.stringify({ cpuThrottle: 4, viewport: '390x844 DPR3', cycles: 12, samples, errors }, null, 2))
  console.log('PASS: 12 scene/mute cycles, background/resume, bounded heap and no leftover sources')
} finally { await browser.close() }
