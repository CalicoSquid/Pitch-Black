import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import ts from 'typescript'

async function freshBudget() {
  const source = await readFile(new URL('../src/rendering/canvasBudget.ts', import.meta.url), 'utf8')
  const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } })
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}#${Math.random()}`)
}

test('sustained missed deadlines reduce quality; healthy and isolated slow frames do not', async () => {
  const { RenderGovernor } = await freshBudget()
  const healthy = new RenderGovernor()
  for (let i = 0; i < 600; i++) healthy.observe(1000 / 60, 2)
  assert.equal(healthy.level, 0)
  healthy.observe(200, 80)
  for (let i = 0; i < 120; i++) healthy.observe(1000 / 60, 2)
  assert.equal(healthy.level, 0)
  const slow = new RenderGovernor()
  for (let i = 0; i < 120; i++) slow.observe(60, 30)
  assert.equal(slow.level, 2)
  for (let i = 0; i < 600; i++) slow.observe(1000 / 60, 1)
  assert.equal(slow.level, 2, 'idle time cannot re-enable a known expensive profile')
  const background = new RenderGovernor()
  for (let i = 0; i < 15; i++) background.observe(100, 80)
  background.resetSamples()
  for (let i = 0; i < 120; i++) background.observe(1000 / 60, 1)
  assert.equal(background.level, 0)
})

function fakeBrowser(search = '') {
  const nativeFrames = new Map()
  const listeners = new Map()
  let nextId = 0
  globalThis.window = {
    innerWidth: 3840, innerHeight: 2160, devicePixelRatio: 1,
    location: { search },
    requestAnimationFrame(callback) { nativeFrames.set(++nextId, callback); return nextId },
    cancelAnimationFrame(id) { nativeFrames.delete(id) },
  }
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { userAgent: 'Firefox Linux aarch64' } })
  globalThis.document = {
    visibilityState: 'visible', documentElement: { dataset: {} },
    addEventListener(name, callback) { listeners.set(name, callback) },
  }
  return {
    nativeFrames,
    advance(time) {
      const batch = [...nativeFrames.values()]
      nativeFrames.clear()
      for (const callback of batch) callback(time)
    },
    visible(value) { document.visibilityState = value; listeners.get('visibilitychange')() },
    cleanup() { delete globalThis.window; delete globalThis.document; delete globalThis.navigator },
  }
}

test('shared scheduler caps ARM at 30fps, supports cancellation, and resumes one loop after hiding', async () => {
  const env = fakeBrowser()
  try {
    const { requestSceneFrame, cancelSceneFrame } = await freshBudget()
    let count = 0
    let handle = 0
    function draw() { count++; handle = requestSceneFrame(draw) }
    handle = requestSceneFrame(draw)
    const cancelled = requestSceneFrame(() => assert.fail('cancelled callback ran'))
    cancelSceneFrame(cancelled)
    assert.equal(env.nativeFrames.size, 1)
    for (let i = 1; i <= 120; i++) env.advance(i * 1000 / 120)
    assert.equal(count, 30)
    env.visible('hidden')
    assert.equal(env.nativeFrames.size, 0)
    env.advance(10000)
    assert.equal(count, 30)
    env.visible('visible')
    assert.equal(env.nativeFrames.size, 1)
    env.advance(10016)
    assert.equal(count, 31)
    cancelSceneFrame(handle)
    assert.equal(env.nativeFrames.size, 0)
  } finally { env.cleanup() }
})

test('4K low mode bounds total allocations as layers mount, without changing logical canvas geometry', async () => {
  const env = fakeBrowser('?quality=low')
  try {
    const { createCanvasSurface } = await freshBudget()
    const canvases = []
    const surfaces = []
    for (let i = 0; i < 9; i++) {
      const canvas = { width: 300, height: 150, style: {} }
      canvases.push(canvas)
      surfaces.push(createCanvasSurface(canvas, { setTransform() {} }, 1.5))
      assert.ok(canvases.reduce((sum, c) => sum + c.width * c.height, 0) <= 4_000_000)
    }
    assert.equal(canvases[0].style.width, '3840px')
    assert.equal(canvases[0].style.height, '2160px')
    surfaces[0].dispose()
    assert.equal(canvases[0].width, 1)
    assert.ok(canvases.slice(1).reduce((sum, c) => sum + c.width * c.height, 0) <= 4_000_000)
    for (const surface of surfaces.slice(1)) surface.dispose()
  } finally { env.cleanup() }
})
