import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import ts from 'typescript'
const source = await readFile(new URL('../src/layers/lotus.ts', import.meta.url), 'utf8')
const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } })
const { advanceLotus } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`)
const flower = () => ({ id: 1, x: 100, scale: 1, hue: 5, state: 'shoot', stateStarted: 1000, riseDuration: 7000, openDuration: 20000, closeDuration: 18000, burnSeed: 1 })

test('a wet-weather lotus emerges, opens, and closes before a gradual retreat', () => {
  const lotus = flower()
  assert.equal(advanceLotus(lotus, 500, true), true)
  assert.equal(lotus.state, 'shoot')
  advanceLotus(lotus, 8050, true)
  assert.equal(lotus.state, 'bud')
  assert.equal(lotus.stateStarted, 8000)
  advanceLotus(lotus, 10650, true)
  assert.equal(lotus.state, 'opening')
  assert.equal(lotus.stateStarted, 10600)
  advanceLotus(lotus, 30650, true)
  assert.equal(lotus.state, 'open')
  advanceLotus(lotus, 60000, false)
  assert.equal(lotus.state, 'closing')
  advanceLotus(lotus, 78000, false)
  assert.equal(lotus.state, 'bud')
  assert.equal(advanceLotus(lotus, 85000, false), true)
  assert.equal(lotus.state, 'sinking')
  assert.equal(advanceLotus(lotus, 92999, false), true)
  assert.equal(advanceLotus(lotus, 93000, false), false)
})

test('rain ending during emergence still lets the bud retreat rather than vanish', () => {
  const lotus = flower()
  advanceLotus(lotus, 8000, false)
  assert.equal(lotus.state, 'bud')
  assert.equal(advanceLotus(lotus, 15000, false), true)
  assert.equal(lotus.state, 'sinking')
  assert.equal(advanceLotus(lotus, 19000, false), true)
  assert.equal(advanceLotus(lotus, 23000, false), false)
})

test('returning rain can reopen a closed bud and lightning still cleans up', () => {
  const lotus = { ...flower(), state: 'bud', stateStarted: 0 }
  advanceLotus(lotus, 3000, true)
  assert.equal(lotus.state, 'opening')
  lotus.state = 'burning'
  lotus.stateStarted = 10000
  assert.equal(advanceLotus(lotus, 14200, true), true)
  assert.equal(lotus.state, 'charred')
  assert.equal(advanceLotus(lotus, 17799, true), true)
  assert.equal(advanceLotus(lotus, 17800, true), false)
})
