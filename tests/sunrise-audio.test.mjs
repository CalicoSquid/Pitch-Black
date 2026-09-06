import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import ts from 'typescript'

async function loadSunriseAudio(tag) {
  const source = await readFile(new URL('../src/sunrise/sunriseAudio.ts', import.meta.url), 'utf8')
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  })
  return { source, module: await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}#${tag}`) }
}

function audioParam(value = 0) {
  return {
    value,
    cancelScheduledValues() {},
    setValueAtTime(next) { this.value = next },
    setTargetAtTime(next) { this.value = next },
    linearRampToValueAtTime(next) { this.value = next },
    exponentialRampToValueAtTime(next) { this.value = next },
  }
}

function makeEnvironment({ deferredResume = false, deferredDecode = false } = {}) {
  const intervals = new Map()
  const oscillators = []
  const bufferSources = []
  const contexts = []
  let intervalId = 0
  let completeResume = null
  let completeDecode = null
  let decodeStartedResolve = null
  let decodeCount = 0
  let fetchCount = 0
  const decodeStarted = new Promise((resolve) => { decodeStartedResolve = resolve })

  class Gain {
    gain = audioParam(0)
    connect() { return this }
    disconnect() {}
  }

  class Oscillator {
    type = 'sine'
    frequency = { value: 0 }
    detune = { value: 0 }
    stopped = false
    onended = null
    connect() { return this }
    disconnect() {}
    start() {}
    stop() { this.stopped = true; this.onended?.() }
  }

  class BufferSource {
    buffer = null
    loop = false
    loopStart = 0
    loopEnd = 0
    stopped = false
    started = false
    startOffset = 0
    onended = null
    connect() { return this }
    disconnect() {}
    start(_when, offset = 0) { this.started = true; this.startOffset = offset }
    stop() { this.stopped = true; this.onended?.() }
  }

  class Context {
    state = deferredResume ? 'suspended' : 'running'
    currentTime = 10
    destination = {}
    closed = false
    constructor() { contexts.push(this) }
    createGain() { return new Gain() }
    createOscillator() { const oscillator = new Oscillator(); oscillators.push(oscillator); return oscillator }
    createBufferSource() { const source = new BufferSource(); bufferSources.push(source); return source }
    addEventListener() {}
    resume() {
      if (!deferredResume) { this.state = 'running'; return Promise.resolve() }
      return new Promise((resolve) => {
        completeResume = () => { if (!this.closed) this.state = 'running'; resolve() }
      })
    }
    decodeAudioData() {
      decodeCount += 1
      decodeStartedResolve?.()
      if (!deferredDecode) return Promise.resolve({ duration: 97.061 })
      return new Promise((resolve) => {
        completeDecode = () => resolve({ duration: 97.061 })
      })
    }
    close() { this.closed = true; this.state = 'closed'; return Promise.resolve() }
  }

  globalThis.window = {
    AudioContext: Context,
    setInterval(fn) { const id = ++intervalId; intervals.set(id, fn); return id },
    clearInterval(id) { intervals.delete(id) },
    setTimeout(fn) { fn(); return 1 },
    clearTimeout() {},
  }
  globalThis.fetch = async (_url, _options) => {
    fetchCount += 1
    return {
      ok: true,
      status: 200,
      arrayBuffer: async () => new ArrayBuffer(32),
    }
  }

  return {
    intervals,
    oscillators,
    bufferSources,
    contexts,
    decodeStarted,
    get decodeCount() { return decodeCount },
    get fetchCount() { return fetchCount },
    completeResume: () => completeResume?.(),
    completeDecode: () => completeDecode?.(),
    cleanup() {
      delete globalThis.window
      delete globalThis.fetch
    },
  }
}

test('cancelling while audio capability is still resuming prevents a late ready/play state', async () => {
  const env = makeEnvironment({ deferredResume: true })
  const { module: audio } = await loadSunriseAudio('cancel-race')
  const controller = new audio.SunriseAudioController()
  const preparing = controller.prepare()
  controller.disposeNow()
  env.completeResume()
  assert.equal(await preparing, false)
  assert.equal(controller.getStatus(), 'idle')
  assert.equal(env.contexts[0].closed, true)
  assert.equal(env.oscillators.length, 0)
  env.cleanup()
})

test('wake audio owns and releases its timers, oscillators and AudioContext', async () => {
  const env = makeEnvironment()
  const { module: audio } = await loadSunriseAudio('cleanup')
  const controller = new audio.SunriseAudioController()
  assert.equal(await controller.startWake(0.4), true)
  assert.equal(env.intervals.size, 1)
  assert.ok(env.oscillators.length >= 3)

  await controller.release(0.1)
  assert.equal(env.intervals.size, 0)
  assert.equal(env.contexts[0].closed, true)
  assert.ok(env.oscillators.every((oscillator) => oscillator.stopped))
  assert.equal(controller.getStatus(), 'idle')
  env.cleanup()
})

test('wake sound is intentionally independent of the nighttime pitch-audio mute graph', async () => {
  const env = makeEnvironment()
  const { source, module: audio } = await loadSunriseAudio('independent-mute')
  assert.equal(source.includes("from '../audio/pitchAudio'"), false)
  globalThis.nighttimeSoundMuted = true
  const controller = new audio.SunriseAudioController()
  assert.equal(await controller.startWake(0.3), true)
  assert.ok(env.oscillators.length >= 3, 'explicit wake audio still starts while nighttime sound is conceptually muted')
  controller.disposeNow()
  delete globalThis.nighttimeSoundMuted
  env.cleanup()
})

test('softening invalidates a delayed startWake before oscillators or repeat timers can appear', async () => {
  const env = makeEnvironment({ deferredResume: true })
  const { module: audio } = await loadSunriseAudio('soften-start-race')
  const controller = new audio.SunriseAudioController()
  let stillHolding = true
  const starting = controller.startWake(0.4, () => stillHolding)

  // This models Snooze/Finish/Cancel arriving while AudioContext.resume() is pending.
  stillHolding = false
  controller.soften(2.5)
  env.completeResume()

  assert.equal(await starting, false)
  assert.equal(env.oscillators.length, 0)
  assert.equal(env.intervals.size, 0)
  controller.disposeNow()
  env.cleanup()
})

test('morning field recording is primed compressed, decoded only in late dawn, and reuses one loop source', async () => {
  const env = makeEnvironment()
  const { module: audio } = await loadSunriseAudio('morning-deferred-decode')
  const controller = new audio.SunriseAudioController()

  assert.equal(audio.morningAmbienceArrival(0.5), 0)
  assert.equal(audio.morningAmbienceArrival(audio.MORNING_AMBIENCE_START_FRACTION), 0)
  assert.ok(audio.morningAmbienceArrival(0.8) > 0.4)
  assert.equal(audio.morningAmbienceArrival(1), 1)

  assert.equal(await controller.prepare(), true)
  assert.equal(await controller.preloadMorningAsset(), true)
  assert.equal(env.fetchCount, 1)
  assert.equal(env.decodeCount, 0, 'arming/preload must not allocate decoded PCM')

  assert.equal(await controller.updateMorningAmbience(0.5, 0.4), false)
  assert.equal(env.decodeCount, 0)
  assert.equal(env.bufferSources.length, 0)

  assert.equal(await controller.updateMorningAmbience(0.8, 0.4), true)
  assert.equal(env.decodeCount, 1)
  assert.equal(env.bufferSources.length, 1)
  assert.equal(env.bufferSources[0].loop, true)
  assert.equal(env.bufferSources[0].started, true)

  assert.equal(await controller.updateMorningAmbience(0.95, 0.4), true)
  assert.equal(env.decodeCount, 1, 'decoded field recording is reused')
  assert.equal(env.bufferSources.length, 1, 'gain updates do not create duplicate bird loops')

  controller.disposeNow()
  assert.equal(env.bufferSources[0].stopped, true)
  env.cleanup()
})

test('Snooze/Finish-style softening invalidates a bird decode before it can become audible', async () => {
  const env = makeEnvironment({ deferredDecode: true })
  const { module: audio } = await loadSunriseAudio('morning-decode-race')
  const controller = new audio.SunriseAudioController()
  assert.equal(await controller.prepare(), true)
  assert.equal(await controller.preloadMorningAsset(), true)

  let stillDawn = true
  const starting = controller.updateMorningAmbience(0.85, 0.4, () => stillDawn)
  await env.decodeStarted
  stillDawn = false
  controller.soften(2.5)
  env.completeDecode()

  assert.equal(await starting, false)
  assert.equal(env.bufferSources.length, 0, 'late decode cannot create a bird source after softening')
  controller.disposeNow()
  env.cleanup()
})

test('sound check demonstrates both the natural morning bed and the bounded chime', async () => {
  const env = makeEnvironment()
  const { module: audio } = await loadSunriseAudio('combined-sound-check')
  const controller = new audio.SunriseAudioController()

  assert.equal(await controller.soundCheck(0.35), true)
  assert.equal(env.bufferSources.length, 1)
  assert.ok(env.oscillators.length >= 3)

  controller.disposeNow()
  env.cleanup()
})


test('below-threshold ambience explicitly stops birds and the final ramp can restart them', async () => {
  const env = makeEnvironment()
  const { module: audio } = await loadSunriseAudio('morning-snooze-threshold')
  const controller = new audio.SunriseAudioController()

  assert.equal(await controller.updateMorningAmbience(0.9, 0.4), true)
  assert.equal(env.bufferSources.length, 1)
  const first = env.bufferSources[0]
  assert.equal(first.stopped, false)

  // Models the quiet middle of Snooze: progress below the arrival threshold is
  // a silence command, not an early return that leaves the loop alive.
  assert.equal(await controller.updateMorningAmbience(0.2, 0.4), false)
  assert.equal(first.stopped, true)

  // The final snooze ramp crosses the arrival threshold again and owns a fresh
  // source rather than reviving the stopped one.
  assert.equal(await controller.updateMorningAmbience(0.9, 0.4), true)
  assert.equal(env.bufferSources.length, 2)
  assert.equal(env.bufferSources[1].started, true)

  controller.disposeNow()
  env.cleanup()
})

test('zero wake volume immediately becomes a bird fade/stop command', async () => {
  const env = makeEnvironment()
  const { module: audio } = await loadSunriseAudio('morning-zero-volume')
  const controller = new audio.SunriseAudioController()

  assert.equal(await controller.updateMorningAmbience(0.95, 0.5), true)
  const source = env.bufferSources[0]
  assert.equal(source.stopped, false)

  assert.equal(await controller.updateMorningAmbience(0.95, 0), false)
  assert.equal(source.stopped, true, 'an existing bird loop must not survive a zero-volume update')

  controller.disposeNow()
  env.cleanup()
})

test('Sound Check -> Arm reset drops decoded PCM but preserves compressed morning audio', async () => {
  const env = makeEnvironment()
  const { module: audio } = await loadSunriseAudio('sound-check-arm-memory')
  const controller = new audio.SunriseAudioController()

  assert.equal(await controller.soundCheck(0.35), true)
  assert.equal(env.fetchCount, 1)
  assert.equal(env.decodeCount, 1)
  assert.equal(env.bufferSources.length, 1)
  assert.ok(controller.morningBuffer, 'sound check has decoded PCM before arming')
  assert.ok(controller.morningCompressed, 'small compressed payload remains available')

  controller.resetForArmedWaiting()
  assert.equal(env.bufferSources[0].stopped, true, 'sound-check field recording is stopped at the Arm boundary')
  assert.equal(controller.morningBuffer, null, 'decoded PCM is released before overnight waiting')
  assert.ok(controller.morningCompressed, 'compressed recording is retained')

  assert.equal(await controller.preloadMorningAsset(), true)
  assert.equal(env.fetchCount, 1, 'arming reuses compressed bytes without another fetch')

  assert.equal(await controller.updateMorningAmbience(0.9, 0.35), true)
  assert.equal(env.decodeCount, 2, 'late dawn decodes again only when birds are needed')

  controller.disposeNow()
  env.cleanup()
})
