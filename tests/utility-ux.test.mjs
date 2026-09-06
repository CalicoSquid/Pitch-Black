import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

async function text(path) { return readFile(new URL(path, import.meta.url), 'utf8') }

test('More is reduced to Sleep, Wake and Utilities while immediate controls stay in the dock', async () => {
  const app = await text('../src/App.tsx')
  assert.match(app, /<div className="utility-section-title">Sleep<\/div>/)
  assert.match(app, /<strong>Sleep timer<\/strong>/)
  assert.match(app, /<div className="utility-section-title">Wake<\/div>/)
  assert.match(app, /<strong>Sunrise alarm<\/strong>/)
  assert.match(app, /<div className="utility-section-title">Utilities<\/div>/)
  assert.match(app, /<strong>Volume<\/strong>/)
  assert.match(app, /<strong>Keep screen on<\/strong>/)
  assert.match(app, /href="\/about\/"/)
  assert.doesNotMatch(app, /Share this world/)
  assert.doesNotMatch(app, /Reset world/)

  const dockStart = app.indexOf('<nav className={`control-dock')
  assert.ok(dockStart >= 0)
  const dock = app.slice(dockStart)
  assert.match(dock, /aria-label="Toggle clock"/)
  assert.match(dock, /Enter fullscreen|Exit fullscreen/)
  assert.match(dock, /Mute all sound|Enable all sound/)
})

test('sleep timer uses a dedicated alarm-style dialog with explicit start, status and cancel actions', async () => {
  const [dialog, app, css] = await Promise.all([
    text('../src/ui/SleepTimerDialog.tsx'),
    text('../src/App.tsx'),
    text('../src/App.css'),
  ])
  assert.match(dialog, /className="sunrise-dialog sleep-timer-dialog"/)
  assert.match(dialog, /A QUIET END/)
  assert.match(dialog, /Sleep timer/)
  assert.match(dialog, /Start timer/)
  assert.match(dialog, /Update timer/)
  assert.match(dialog, /Cancel timer/)
  assert.match(dialog, /final minute/)
  assert.match(dialog, /sunrise alarm has its own wake sound/i)
  assert.match(app, /<SleepTimerDialog/)
  assert.match(css, /\.sleep-timer-dialog-body/)
  assert.match(css, /\.utility-menu-copy strong \{[\s\S]*font-size: 14px/)
  assert.match(css, /\.control-dock:has\(:focus-visible\)/)
  assert.doesNotMatch(css, /\.control-dock:focus-within/)
})

test('About owns the lightweight share action and remains independent of the app engine', async () => {
  const about = await text('../about/index.html')
  assert.match(about, /Share This Quiet World/)
  assert.match(about, /navigator\.share/)
  assert.doesNotMatch(about, /type=["']module["']/i)
  assert.doesNotMatch(about, /src=["'][^"']*\.js/i)
})
