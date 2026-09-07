import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import ts from 'typescript'

async function loadSunriseLogic() {
  const source = await readFile(new URL('../src/sunrise/sunriseLogic.ts', import.meta.url), 'utf8')
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  })
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}#sunrise-logic`)
}

const sunrise = await loadSunriseLogic()

const settings = (wakeTime, durationMinutes = 20) => ({
  wakeTime,
  durationMinutes,
  finalIntensity: 0.62,
  wakeVolume: 0.35,
})

function localTs(year, month, day, hour, minute, second = 0) {
  return new Date(year, month - 1, day, hour, minute, second, 0).getTime()
}

test('sunrise schedules across midnight and shortens a too-near dawn without moving wake time', () => {
  const now = localTs(2026, 9, 6, 23, 55)
  const plan = sunrise.createSunrisePlan(settings('00:05', 20), now, 1)
  assert.ok(plan)
  assert.equal(plan.wakeAt, localTs(2026, 9, 7, 0, 5))
  assert.equal(plan.startAt, now)
  assert.equal(plan.actualDurationMs, 10 * 60_000)
  assert.equal(plan.shortened, true)
  assert.equal(plan.targetDate, '2026-09-07')
  assert.equal(sunrise.phaseForPlan(plan, now), 'dawn')
})

test('normal sunrise begins the selected duration before the confirmed local wake time', () => {
  const now = localTs(2026, 9, 6, 21, 0)
  const plan = sunrise.createSunrisePlan(settings('07:00', 30), now, 2)
  assert.ok(plan)
  assert.equal(plan.wakeAt, localTs(2026, 9, 7, 7, 0))
  assert.equal(plan.startAt, localTs(2026, 9, 7, 6, 30))
  assert.equal(plan.actualDurationMs, 30 * 60_000)
  assert.equal(plan.shortened, false)
  assert.equal(sunrise.phaseForPlan(plan, localTs(2026, 9, 7, 6, 29)), 'armed')
  assert.equal(sunrise.phaseForPlan(plan, localTs(2026, 9, 7, 6, 45)), 'dawn')
  assert.equal(sunrise.phaseForPlan(plan, plan.wakeAt), 'holding')
})

test('expired alarms distinguish a normal foreground timeout from a late resume', () => {
  const now = localTs(2026, 9, 6, 22, 0)
  const plan = sunrise.createSunrisePlan(settings('22:30', 20), now, 3)
  assert.ok(plan)
  assert.equal(sunrise.phaseForPlan(plan, plan.holdUntil - 1), 'holding')
  assert.equal(sunrise.phaseForPlan(plan, plan.holdUntil), 'expired')
  assert.equal(sunrise.shouldFadeExpiredAlarm(plan.holdUntil - 1_000, plan.holdUntil + 500, plan.holdUntil), true)
  assert.equal(sunrise.shouldFadeExpiredAlarm(plan.wakeAt, plan.holdUntil + 10 * 60_000, plan.holdUntil), false)
})

test('snooze returns fully to night, rises again at an absolute wake timestamp, then expires', () => {
  const now = localTs(2026, 9, 6, 22, 0)
  const plan = sunrise.createSunrisePlan(settings('22:10', 10), now, 4)
  assert.ok(plan)
  const holding = { ...sunrise.makeArmedRuntime(plan), lifecycle: 'holding' }
  const snoozedAt = plan.wakeAt + 1_000
  const snoozed = sunrise.makeSnoozedRuntime(holding, snoozedAt)

  assert.equal(snoozed.snoozeWakeAt, snoozedAt + sunrise.SUNRISE_SNOOZE_MS)
  assert.equal(sunrise.snoozedPhase(snoozed, snoozedAt + 30_000), 'snoozed')
  assert.equal(
    sunrise.runtimeVisualFraction(snoozed, snoozedAt + sunrise.SUNRISE_SNOOZE_SOFTEN_MS + 1),
    0,
    'snooze settles to true night rather than retaining a dawn tint',
  )
  assert.equal(
    sunrise.runtimeVisualFraction(snoozed, snoozed.snoozeWakeAt - sunrise.SUNRISE_SNOOZE_RAMP_MS - 1),
    0,
    'the quiet middle stays fully dark until the fresh dawn ramp begins',
  )
  assert.ok(sunrise.runtimeVisualFraction(snoozed, snoozed.snoozeWakeAt - 30_000) > 0.8)
  assert.equal(sunrise.snoozedPhase(snoozed, snoozed.snoozeWakeAt), 'holding')
  assert.equal(sunrise.snoozedPhase(snoozed, snoozed.snoozeHoldUntil), 'expired')
})

test('finish and cancel fade from the current dawn level and finalize cleanly', () => {
  const now = localTs(2026, 9, 6, 22, 0)
  const plan = sunrise.createSunrisePlan(settings('22:20', 20), now, 5)
  assert.ok(plan)
  const dawnAt = now + 10 * 60_000
  const runtime = { ...sunrise.makeArmedRuntime(plan), lifecycle: 'dawn' }
  const before = sunrise.runtimeVisualFraction(runtime, dawnAt)
  assert.ok(before > 0 && before < 1)

  const finishing = sunrise.makeFinishingRuntime(runtime, dawnAt, 'finished', sunrise.SUNRISE_FINISH_FADE_MS)
  assert.equal(finishing.lifecycle, 'finishing')
  assert.ok(sunrise.runtimeVisualFraction(finishing, dawnAt + sunrise.SUNRISE_FINISH_FADE_MS / 2) < before)
  assert.equal(sunrise.runtimeVisualFraction(finishing, finishing.finishEndsAt), 0)
  assert.equal(sunrise.finalizeRuntime(finishing).lifecycle, 'finished')

  const cancelling = sunrise.makeFinishingRuntime(runtime, dawnAt, 'cancelled', sunrise.SUNRISE_CANCEL_FADE_MS)
  assert.equal(sunrise.finalizeRuntime(cancelling).lifecycle, 'cancelled')
})


test('hook lifecycle keeps the snoozed hold deadline after returning to holding', () => {
  const now = localTs(2026, 9, 7, 6, 40)
  const plan = sunrise.createSunrisePlan(settings('07:00', 20), now, 6)
  assert.ok(plan)

  const initialHolding = { ...sunrise.makeArmedRuntime(plan), lifecycle: 'holding' }
  const snoozedAt = localTs(2026, 9, 7, 7, 0)
  const snoozed = sunrise.makeSnoozedRuntime(initialHolding, snoozedAt)
  const secondWake = snoozed.snoozeWakeAt
  const secondHoldUntil = snoozed.snoozeHoldUntil
  assert.ok(secondWake && secondHoldUntil)

  // This is the exact state transition function used by useSunriseAlarm's timer.
  const holdingAgain = sunrise.advanceSunriseRuntime(snoozed, secondWake, secondWake - 1_000, true)
  assert.equal(holdingAgain.lifecycle, 'holding')
  assert.equal(holdingAgain.snoozeHoldUntil, secondHoldUntil)

  // The original alarm would have expired at 07:20. The snoozed cycle must still
  // be holding at 07:20:01 and continue until 20 minutes after the 07:09 wake.
  const afterOriginalDeadline = localTs(2026, 9, 7, 7, 20, 1)
  const stillHolding = sunrise.advanceSunriseRuntime(holdingAgain, afterOriginalDeadline, afterOriginalDeadline - 1_000, true)
  assert.equal(stillHolding.lifecycle, 'holding')

  const normalExpiry = sunrise.advanceSunriseRuntime(stillHolding, secondHoldUntil + 500, secondHoldUntil - 1_000, true)
  assert.equal(normalExpiry.lifecycle, 'finishing')

  const lateResume = sunrise.advanceSunriseRuntime(stillHolding, secondHoldUntil + 10 * 60_000, secondWake, true)
  assert.equal(lateResume.lifecycle, 'finished')
})


test('snooze morning ambience stays off until the final re-rise, then reaches full arrival', () => {
  const now = localTs(2026, 9, 7, 6, 40)
  const plan = sunrise.createSunrisePlan(settings('07:00', 20), now, 7)
  assert.ok(plan)

  const holding = { ...sunrise.makeArmedRuntime(plan), lifecycle: 'holding' }
  const snoozedAt = localTs(2026, 9, 7, 7, 0)
  const snoozed = sunrise.makeSnoozedRuntime(holding, snoozedAt)
  assert.ok(snoozed.snoozeWakeAt)

  assert.equal(
    sunrise.runtimeMorningAmbienceFraction(snoozed, snoozedAt + 30_000),
    0,
    'birds stay fully off through the quiet middle of snooze',
  )

  const finalRampAt = snoozed.snoozeWakeAt - sunrise.SUNRISE_SNOOZE_RAMP_MS + 90_000
  assert.ok(
    sunrise.runtimeMorningAmbienceFraction(snoozed, finalRampAt) > 0,
    'final snooze ramp is allowed to bring the morning bed back',
  )
  assert.equal(
    sunrise.runtimeMorningAmbienceFraction(snoozed, snoozed.snoozeWakeAt),
    1,
  )
})
