import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import ts from 'typescript'

async function loadSource(path) {
  const source = await readFile(new URL(path, import.meta.url), 'utf8')
  const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } })
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`)
}

const { AudioBufferCache } = await loadSource('../src/audio/audioBufferCache.ts')
const buffer = (bytes) => ({ length: bytes / 4, numberOfChannels: 1 })

test('decoded cache evicts least recently used buffers within a byte budget', () => {
  const cache = new AudioBufferCache(32)
  const a = buffer(16), b = buffer(16), c = buffer(16)
  cache.set('a', a); cache.set('b', b)
  assert.equal(cache.get('a'), a)
  cache.set('c', c)
  assert.equal(cache.get('b'), undefined)
  assert.equal(cache.get('a'), a)
  assert.equal(cache.get('c'), c)
  cache.set('oversized', buffer(64))
  assert.equal(cache.get('oversized'), undefined)
  assert.equal(cache.get('a'), a)
  // Eviction only removes the cache reference; an active source still owns a.
  assert.equal(a.length, 4)
})

test('replacing cache keys does not accumulate stale byte accounting', () => {
  const cache = new AudioBufferCache(32)
  for (let i = 0; i < 100_000; i++) cache.set('same', buffer(16))
  cache.set('second', buffer(16))
  assert.ok(cache.get('same'))
  assert.ok(cache.get('second'))
})

test('continuous overnight audio controls retain only the current envelope', async () => {
  const { setContinuousAudioTarget } = await loadSource('../src/audio/pitchAudio.ts')
  const param = {
    value: 0.2,
    events: [],
    cancelScheduledValues(time) { this.events = this.events.filter(e => e.time < time) },
    setValueAtTime(value, time) { this.events.push({ value, time }) },
    setTargetAtTime(value, time, tau) { this.events.push({ value, time, tau }) },
  }
  for (let i = 0; i < 864_000; i++) setContinuousAudioTarget(param, i % 2 ? 0.1 : 0.2, i / 30, 0.85)
  assert.equal(param.events.length, 2)
  assert.equal(param.events[0].value, 0.2)
  assert.equal(param.events[1].tau, 0.85)
})

test('canvas backing stores remain bounded on 4K and low-memory screens', async () => {
  const { canvasPixelRatio } = await loadSource('../src/rendering/canvasBudget.ts')
  globalThis.window = { devicePixelRatio: 3 }
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { deviceMemory: 2 } })
  let dpr = canvasPixelRatio(3840, 2160, 1.5)
  assert.ok(3840 * 2160 * dpr * dpr <= 2_000_001)
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: {} })
  dpr = canvasPixelRatio(3840, 2160, 1.5)
  assert.ok(3840 * 2160 * dpr * dpr <= 4_000_001)
  assert.equal(canvasPixelRatio(390, 844, 1.5), 1.5)
  delete globalThis.window
})

test('late resume cannot reopen hidden audio, and interrupted contexts can recover', async () => {
  const audio = await loadSource('../src/audio/pitchAudio.ts')
  const signals = []
  const timers = new Map()
  let timerId = 0
  let completeResume
  let suspendCalls = 0
  const param = () => ({ value: 1, cancelScheduledValues() {}, setValueAtTime(value) { this.value = value }, setTargetAtTime(value) { this.value = value } })
  class Context {
    state = 'suspended'
    currentTime = 0
    destination = {}
    createGain() { return { gain: param(), connect() {}, disconnect() {} } }
    resume() { return new Promise(resolve => { completeResume = () => { this.state = 'running'; resolve() } }) }
    suspend() { suspendCalls++; this.state = 'suspended'; return Promise.resolve() }
  }
  globalThis.document = { visibilityState: 'visible' }
  globalThis.window = {
    AudioContext: Context,
    dispatchEvent(event) { signals.push(event.type) },
    setTimeout(fn) { timers.set(++timerId, fn); return timerId },
    clearTimeout(id) { timers.delete(id) },
  }
  const context = audio.unlockPitchAudio()
  document.visibilityState = 'hidden'
  audio.suspendPitchAudio()
  completeResume()
  await Promise.resolve()
  await Promise.resolve()
  assert.equal(context.state, 'suspended')
  assert.equal(signals.length, 0)
  assert.equal(timers.size, 0)
  assert.ok(suspendCalls >= 2)

  document.visibilityState = 'visible'
  context.state = 'interrupted'
  audio.unlockPitchAudio()
  completeResume()
  await Promise.resolve()
  assert.equal(context.state, 'running')
  assert.equal(signals.length, 1)
  assert.equal(timers.size, 1)
  audio.suspendPitchAudio()
  assert.equal(timers.size, 0)
  delete globalThis.document
  delete globalThis.window
})
