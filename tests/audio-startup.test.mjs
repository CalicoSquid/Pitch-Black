import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import ts from 'typescript'

async function loadPitchAudio() {
  const source = await readFile(new URL('../src/audio/pitchAudio.ts', import.meta.url), 'utf8')
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  })
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}#startup`)
}

function audioParam(value = 1) {
  return {
    value,
    cancelScheduledValues() {},
    setValueAtTime(next) { this.value = next },
    setTargetAtTime(next) { this.value = next },
    linearRampToValueAtTime(next) { this.value = next },
  }
}

test('persistent callers never receive a suspended context and recover on the first real resume', async () => {
  const audio = await loadPitchAudio()
  const signals = []
  const timers = new Map()
  let timerId = 0
  let completeResume

  class Context {
    state = 'suspended'
    currentTime = 0
    destination = {}
    listeners = new Set()
    createGain() { return { gain: audioParam(), connect() {}, disconnect() {} } }
    addEventListener(type, listener) { if (type === 'statechange') this.listeners.add(listener) }
    emitState() { for (const listener of this.listeners) listener() }
    resume() {
      return new Promise((resolve) => {
        completeResume = () => {
          this.state = 'running'
          this.emitState()
          resolve()
        }
      })
    }
    suspend() {
      this.state = 'suspended'
      this.emitState()
      return Promise.resolve()
    }
  }

  globalThis.document = { visibilityState: 'visible' }
  globalThis.window = {
    AudioContext: Context,
    dispatchEvent(event) { signals.push(event.type) },
    setTimeout(fn) { timers.set(++timerId, fn); return timerId },
    clearTimeout(id) { timers.delete(id) },
  }

  assert.equal(audio.getPitchAudio(), null, 'a suspended context must not be handed to loop owners')
  completeResume()
  await Promise.resolve()
  await Promise.resolve()
  const running = audio.getPitchAudio()
  assert.ok(running)
  assert.equal(running.state, 'running')
  assert.equal(signals.filter((name) => name === audio.PITCH_AUDIO_READY_EVENT).length, 1)

  // An unexpected browser interruption creates a fresh readiness boundary.
  running.state = 'suspended'
  running.emitState()
  assert.equal(audio.getPitchAudio(), null)
  completeResume()
  await Promise.resolve()
  await Promise.resolve()
  assert.equal(signals.filter((name) => name === audio.PITCH_AUDIO_READY_EVENT).length, 2)

  delete globalThis.document
  delete globalThis.window
})
