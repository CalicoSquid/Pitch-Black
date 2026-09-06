import assert from 'node:assert/strict'
import { readdir, readFile, stat } from 'node:fs/promises'
import test from 'node:test'

const root = new URL('../', import.meta.url)
const asset = new URL('../public/audio/summer-dawn-birds-phoenix-arizona.mp3', import.meta.url)

test('sunrise ships the compact local morning field recording, not the supplied WAV master', async () => {
  const info = await stat(asset)
  assert.ok(info.size > 500_000, 'field recording derivative should contain real audio, not a placeholder')
  assert.ok(info.size < 1_500_000, 'compressed sunrise asset should stay small enough to prime at arm time')

  const publicAudio = await readdir(new URL('../public/audio/', import.meta.url))
  assert.ok(publicAudio.includes('summer-dawn-birds-phoenix-arizona.mp3'))
  assert.equal(publicAudio.some((name) => /395322.*\.wav$/i.test(name)), false, '18 MB source WAV must not ship')
})

test('morning audio is local, documented as CC0, and wired into sunrise rather than an external runtime URL', async () => {
  const [controller, sources, publicSources] = await Promise.all([
    readFile(new URL('../src/sunrise/sunriseAudio.ts', import.meta.url), 'utf8'),
    readFile(new URL('../AUDIO_SOURCES.md', import.meta.url), 'utf8'),
    readFile(new URL('../public/audio/SOURCES.md', import.meta.url), 'utf8'),
  ])

  assert.ok(controller.includes("'/audio/summer-dawn-birds-phoenix-arizona.mp3'"))
  assert.equal(/freesound\.org|http:\/\/|https:\/\//i.test(controller), false, 'runtime controller must use only the bundled asset')
  assert.ok(sources.includes('Freesound sound 395322'))
  assert.ok(sources.includes('Creative Commons 0 (CC0 1.0)'))
  assert.ok(publicSources.includes('sounds/395322/'))
})
