import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { chromium, firefox, webkit } from '../.perf-tools/node_modules/playwright/index.mjs'

const root = new URL('../.perf-tools/', import.meta.url)
await mkdir(root, { recursive: true })
const results = []
const mode = process.argv[2] || 'chromium'
const type = { chromium, firefox, webkit }[mode]
const browser = await type.launch({ headless: true, ...(mode === 'chromium' ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE, args: ['--autoplay-policy=no-user-gesture-required'] } : {}) })

async function instrument(context) {
  await context.addInitScript(() => {
    window.__perf = { decodedBytes: 0, decodes: 0, liveSources: 0, contexts: [], clears: 0 }
    const Base = window.AudioContext || window.webkitAudioContext
    if (Base) {
      const decode = Base.prototype.decodeAudioData
      Base.prototype.decodeAudioData = function (...args) {
        return decode.apply(this, args).then(buffer => {
          window.__perf.decodedBytes += buffer.length * buffer.numberOfChannels * 4
          window.__perf.decodes++
          return buffer
        })
      }
      const create = Base.prototype.createBufferSource
      Base.prototype.createBufferSource = function (...args) {
        const source = create.apply(this, args)
        const start = source.start
        source.start = function (...args) {
          window.__perf.liveSources++
          source.addEventListener('ended', () => window.__perf.liveSources--, { once: true })
          return start.apply(this, args)
        }
        return source
      }
      window.AudioContext = class extends Base {
        constructor(...args) { super(...args); window.__perf.contexts.push(this) }
      }
    }
    const clear = CanvasRenderingContext2D.prototype.clearRect
    CanvasRenderingContext2D.prototype.clearRect = function (...args) { window.__perf.clears++; return clear.apply(this, args) }
  })
}
async function snapshot(page) {
  return page.evaluate(() => ({
    decodedMiB: +(window.__perf.decodedBytes / 1048576).toFixed(2),
    decodes: window.__perf.decodes,
    liveSources: window.__perf.liveSources,
    audioStates: window.__perf.contexts.map(c => c.state),
    canvasMiB: +([...document.querySelectorAll('canvas')].reduce((n,c) => n+c.width*c.height*4,0)/1048576).toFixed(2),
    largestCanvas: Math.max(...[...document.querySelectorAll('canvas')].map(c => c.width*c.height)),
    clears: window.__perf.clears,
  }))
}
async function click(page, name) {
  await page.mouse.move(50, 50)
  await page.getByRole('button', { name, exact: true }).click({ force: true })
}
try {
  for (const port of (mode === 'chromium' && process.env.PERF_COMPARE_BASELINE === '1' ? [4174, 4173] : [4173])) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, serviceWorkers: 'block' })
    await instrument(context)
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.goto(`http://127.0.0.1:${port}/`)
    await click(page, 'Black: clear the visible world to pure black')
    await click(page, 'Enable all sound')
    await page.waitForTimeout(5000)
    const black = await snapshot(page)
    console.log(mode, port, 'black', black)
    if (port === 4173) { assert.equal(black.liveSources, 0); assert.equal(black.decodes, 0) }
    await click(page, 'Rain scene')
    const supportsAudio = await page.evaluate(() => typeof AudioContext !== 'undefined' || typeof window.webkitAudioContext !== 'undefined')
    if (supportsAudio) await page.waitForFunction(() => window.__perf.liveSources >= 2)
    await page.waitForTimeout(1500)
    const rain = await snapshot(page)
    if (supportsAudio) assert.ok(rain.audioStates.includes('running'))
    await page.screenshot({ path: new URL(`${mode}-${port}-rain.png`, root).pathname.replace(/^\/(.:)/, '$1') })
    await click(page, 'Snow scene')
    await page.waitForTimeout(3000)
    await click(page, 'Black: clear the visible world to pure black')
    await page.waitForTimeout(9000)
    const returned = await snapshot(page)
    if (port === 4173) assert.equal(returned.liveSources, 0, 'weather tails must release their sources')
    await page.setViewportSize({ width: 3840, height: 2160 })
    await page.waitForTimeout(500)
    const tv = await snapshot(page)
    if (port === 4173) assert.ok(tv.largestCanvas <= 4_005_000)
    results.push({ browser: mode, supportsAudio, port, black, rain, returned, tv, errors })
    assert.deepEqual(errors, [])
    await context.close()
  }
} finally {
  await writeFile(new URL(`${mode}-results.json`, root), JSON.stringify(results, null, 2))
  await browser.close()
}
console.log(JSON.stringify(results, null, 2))
