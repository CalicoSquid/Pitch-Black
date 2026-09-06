import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import ts from 'typescript'

async function loadEntryIntent() {
  const source = await readFile(new URL('../src/entryIntent.ts', import.meta.url), 'utf8')
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  })
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}#entry-intent`)
}

const entry = await loadEntryIntent()
const saved = {
  scene: 'snow', showClock: false, soundOn: false, volume: 0.37, aliveOn: true,
  layers: { moon: false, storm: false, fireflies: false },
}

test('discovery entry intents apply only their advertised initial setting', () => {
  const rain = entry.applyEntryMode(saved, 'rain')
  assert.equal(rain.scene, 'rain')
  assert.equal(rain.aliveOn, false)
  assert.equal(rain.soundOn, saved.soundOn)
  assert.equal(rain.volume, saved.volume)
  assert.equal(rain.showClock, saved.showClock)
  assert.equal(rain.layers, saved.layers)

  const clock = entry.applyEntryMode(saved, 'clock')
  assert.equal(clock.showClock, true)
  assert.equal(clock.scene, saved.scene)
  assert.equal(clock.aliveOn, saved.aliveOn)
  assert.equal(clock.soundOn, saved.soundOn)

  const sunrise = entry.applyEntryMode(saved, 'sunrise')
  assert.equal(sunrise, saved)
})

test('incidental entry settings do not overwrite saved preferences, while deliberate unrelated changes do persist', () => {
  const rainSession = { ...entry.applyEntryMode(saved, 'rain'), soundOn: true, volume: 0.52 }
  const rainPersisted = entry.preferencesForEntryPersistence(rainSession, saved, 'rain', false, true)
  assert.equal(rainPersisted.scene, saved.scene)
  assert.equal(rainPersisted.aliveOn, saved.aliveOn)
  assert.equal(rainPersisted.soundOn, true)
  assert.equal(rainPersisted.volume, 0.52)

  const clockSession = { ...entry.applyEntryMode(saved, 'clock'), volume: 0.61 }
  const clockPersisted = entry.preferencesForEntryPersistence(clockSession, saved, 'clock', true, false)
  assert.equal(clockPersisted.showClock, saved.showClock)
  assert.equal(clockPersisted.volume, 0.61)

  const claimedRain = entry.preferencesForEntryPersistence(rainSession, saved, 'rain', true, true)
  assert.equal(claimedRain.scene, 'rain')
  assert.equal(claimedRain.aliveOn, false)
})

test('entry query parsing ignores unrelated values', () => {
  assert.equal(entry.readEntryMode('?entry=rain'), 'rain')
  assert.equal(entry.readEntryMode('?entry=clock&x=1'), 'clock')
  assert.equal(entry.readEntryMode('?entry=sunrise'), 'sunrise')
  assert.equal(entry.readEntryMode('?entry=storm'), null)
})
