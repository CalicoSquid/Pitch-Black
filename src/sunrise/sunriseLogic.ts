export const SUNRISE_DURATION_OPTIONS = [10, 20, 30] as const
export const SUNRISE_HOLD_MS = 20 * 60_000
export const SUNRISE_SNOOZE_MS = 9 * 60_000
export const SUNRISE_SNOOZE_SOFTEN_MS = 8_000
export const SUNRISE_SNOOZE_RAMP_MS = 3 * 60_000
export const SUNRISE_FINISH_FADE_MS = 20_000
export const SUNRISE_CANCEL_FADE_MS = 2_000

export type SunriseLifecycle =
  | 'idle'
  | 'armed'
  | 'dawn'
  | 'holding'
  | 'snoozed'
  | 'finishing'
  | 'finished'
  | 'cancelled'

export type SunriseSettings = {
  wakeTime: string
  durationMinutes: (typeof SUNRISE_DURATION_OPTIONS)[number]
  finalIntensity: number
  wakeVolume: number
}

export type SunrisePlan = {
  id: number
  wakeTime: string
  targetDate: string
  timezoneOffsetAtArm: number
  wakeAt: number
  requestedStartAt: number
  startAt: number
  requestedDurationMs: number
  actualDurationMs: number
  holdUntil: number
  finalIntensity: number
  wakeVolume: number
  shortened: boolean
}

export type SunriseRuntime = {
  lifecycle: SunriseLifecycle
  plan: SunrisePlan | null
  snoozeFromLevel: number
  snoozedAt: number | null
  snoozeWakeAt: number | null
  snoozeHoldUntil: number | null
  finishStartedAt: number | null
  finishEndsAt: number | null
  finishFromLevel: number
  finishOutcome: 'finished' | 'cancelled' | null
}

export const DEFAULT_SUNRISE_SETTINGS: SunriseSettings = {
  wakeTime: '07:00',
  durationMinutes: 20,
  finalIntensity: 0.62,
  wakeVolume: 0.35,
}

export const IDLE_SUNRISE_RUNTIME: SunriseRuntime = {
  lifecycle: 'idle',
  plan: null,
  snoozeFromLevel: 0,
  snoozedAt: null,
  snoozeWakeAt: null,
  snoozeHoldUntil: null,
  finishStartedAt: null,
  finishEndsAt: null,
  finishFromLevel: 0,
  finishOutcome: null,
}

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value))
}

function smoothstep(value: number) {
  const t = clamp01(value)
  return t * t * (3 - 2 * t)
}

export function parseWakeTime(value: string) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value)
  if (!match) return null
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (!Number.isInteger(hours) || !Number.isInteger(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null
  return { hours, minutes }
}

export function formatLocalDateKey(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function resolveNextLocalWake(wakeTime: string, nowMs: number) {
  const parsed = parseWakeTime(wakeTime)
  if (!parsed) return null

  const now = new Date(nowMs)
  const candidate = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    parsed.hours,
    parsed.minutes,
    0,
    0,
  )

  if (candidate.getTime() <= nowMs) candidate.setDate(candidate.getDate() + 1)
  return candidate.getTime()
}

/**
 * Rebuild an armed wake timestamp from the date/time the user confirmed. This
 * keeps the alarm tied to local wall-clock time if the browser's timezone offset
 * changes while the page remains open (for example around DST or travel).
 */
export function resolveConfirmedLocalWake(targetDate: string, wakeTime: string) {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(targetDate)
  const time = parseWakeTime(wakeTime)
  if (!dateMatch || !time) return null
  const year = Number(dateMatch[1])
  const month = Number(dateMatch[2]) - 1
  const day = Number(dateMatch[3])
  const candidate = new Date(year, month, day, time.hours, time.minutes, 0, 0)
  if (
    candidate.getFullYear() !== year ||
    candidate.getMonth() !== month ||
    candidate.getDate() !== day ||
    candidate.getHours() !== time.hours ||
    candidate.getMinutes() !== time.minutes
  ) return null
  return candidate.getTime()
}

export function createSunrisePlan(settings: SunriseSettings, nowMs: number, id = nowMs): SunrisePlan | null {
  const wakeAt = resolveNextLocalWake(settings.wakeTime, nowMs)
  if (wakeAt === null) return null
  const requestedDurationMs = settings.durationMinutes * 60_000
  const requestedStartAt = wakeAt - requestedDurationMs
  const startAt = Math.max(nowMs, requestedStartAt)
  const actualDurationMs = Math.max(1, wakeAt - startAt)
  const wakeDate = new Date(wakeAt)

  return {
    id,
    wakeTime: settings.wakeTime,
    targetDate: formatLocalDateKey(wakeDate),
    timezoneOffsetAtArm: wakeDate.getTimezoneOffset(),
    wakeAt,
    requestedStartAt,
    startAt,
    requestedDurationMs,
    actualDurationMs,
    holdUntil: wakeAt + SUNRISE_HOLD_MS,
    finalIntensity: clamp01(settings.finalIntensity),
    wakeVolume: clamp01(settings.wakeVolume),
    shortened: startAt > requestedStartAt + 999,
  }
}

export function refreshPlanForLocalTimezone(plan: SunrisePlan, nowMs: number): SunrisePlan {
  const currentOffset = new Date(nowMs).getTimezoneOffset()
  if (currentOffset === plan.timezoneOffsetAtArm) return plan

  const refreshedWakeAt = resolveConfirmedLocalWake(plan.targetDate, plan.wakeTime)
  if (refreshedWakeAt === null) return plan
  const requestedStartAt = refreshedWakeAt - plan.requestedDurationMs
  // An offset change after dawn should never rewind the ramp behind "now".
  const startAt = Math.max(Math.min(plan.startAt, refreshedWakeAt), requestedStartAt)
  return {
    ...plan,
    wakeAt: refreshedWakeAt,
    requestedStartAt,
    startAt,
    actualDurationMs: Math.max(1, refreshedWakeAt - startAt),
    holdUntil: refreshedWakeAt + SUNRISE_HOLD_MS,
    timezoneOffsetAtArm: currentOffset,
    shortened: startAt > requestedStartAt + 999,
  }
}

export function phaseForPlan(plan: SunrisePlan, nowMs: number): 'armed' | 'dawn' | 'holding' | 'expired' {
  if (nowMs < plan.startAt) return 'armed'
  if (nowMs < plan.wakeAt) return 'dawn'
  if (nowMs < plan.holdUntil) return 'holding'
  return 'expired'
}

export function shouldFadeExpiredAlarm(lastObservedAt: number, nowMs: number, holdUntil: number) {
  // Normal foreground expiry gets the quiet 20s exit. A page that wakes after a
  // substantial gap is treated as already completed so it never replays dawn or sound.
  return lastObservedAt <= holdUntil && nowMs - lastObservedAt <= 5_000
}

export function dawnFraction(plan: SunrisePlan, nowMs: number) {
  if (nowMs <= plan.startAt) return 0
  if (nowMs >= plan.wakeAt) return 1
  return smoothstep((nowMs - plan.startAt) / Math.max(1, plan.wakeAt - plan.startAt))
}

export function snoozeFraction(runtime: SunriseRuntime, nowMs: number) {
  const plan = runtime.plan
  const snoozedAt = runtime.snoozedAt
  const snoozeWakeAt = runtime.snoozeWakeAt
  if (!plan || snoozedAt === null || snoozeWakeAt === null) return 0

  // Snooze means back to sleep: let dawn disappear completely, hold true
  // nighttime darkness, then begin a fresh three-minute dawn into the snoozed
  // wake time. Keeping the floor at zero also restores the user's normal night
  // audio mix while the wake-specific bird/chime graph stays softened.
  if (nowMs <= snoozedAt) return runtime.snoozeFromLevel
  if (nowMs < snoozedAt + SUNRISE_SNOOZE_SOFTEN_MS) {
    return runtime.snoozeFromLevel * (1 - smoothstep((nowMs - snoozedAt) / SUNRISE_SNOOZE_SOFTEN_MS))
  }

  const rampStart = Math.max(snoozedAt + SUNRISE_SNOOZE_SOFTEN_MS, snoozeWakeAt - SUNRISE_SNOOZE_RAMP_MS)
  if (nowMs <= rampStart) return 0
  if (nowMs >= snoozeWakeAt) return 1
  return smoothstep((nowMs - rampStart) / Math.max(1, snoozeWakeAt - rampStart))
}

export function runtimeVisualFraction(runtime: SunriseRuntime, nowMs: number) {
  const plan = runtime.plan
  if (!plan) return 0

  if (runtime.lifecycle === 'armed') return 0
  if (runtime.lifecycle === 'dawn') return dawnFraction(plan, nowMs)
  if (runtime.lifecycle === 'holding') return 1
  if (runtime.lifecycle === 'snoozed') return snoozeFraction(runtime, nowMs)
  if (runtime.lifecycle === 'finishing') {
    if (runtime.finishStartedAt === null || runtime.finishEndsAt === null) return 0
    const duration = Math.max(1, runtime.finishEndsAt - runtime.finishStartedAt)
    const elapsed = nowMs - runtime.finishStartedAt
    return Math.max(0, runtime.finishFromLevel * (1 - smoothstep(elapsed / duration)))
  }
  return 0
}

/** Wake audio is eligible only during the current alarm's actual hold window. */
export function runtimeMorningAmbienceFraction(runtime: SunriseRuntime, nowMs: number) {
  if (runtime.lifecycle !== 'holding' || !runtime.plan) return 0
  const wakeAt = runtime.snoozeWakeAt ?? runtime.plan.wakeAt
  const holdUntil = runtime.snoozeHoldUntil ?? runtime.plan.holdUntil
  return nowMs >= wakeAt && nowMs < holdUntil ? 1 : 0
}

export function makeArmedRuntime(plan: SunrisePlan): SunriseRuntime {
  return {
    ...IDLE_SUNRISE_RUNTIME,
    lifecycle: 'armed',
    plan,
  }
}

export function makeSnoozedRuntime(runtime: SunriseRuntime, nowMs: number): SunriseRuntime {
  if (!runtime.plan) return runtime
  const snoozeWakeAt = nowMs + SUNRISE_SNOOZE_MS
  return {
    ...runtime,
    lifecycle: 'snoozed',
    snoozeFromLevel: runtimeVisualFraction(runtime, nowMs),
    snoozedAt: nowMs,
    snoozeWakeAt,
    snoozeHoldUntil: snoozeWakeAt + SUNRISE_HOLD_MS,
    finishStartedAt: null,
    finishEndsAt: null,
    finishOutcome: null,
  }
}

export function snoozedPhase(runtime: SunriseRuntime, nowMs: number): 'snoozed' | 'holding' | 'expired' {
  if (runtime.snoozeWakeAt === null || runtime.snoozeHoldUntil === null) return 'expired'
  if (nowMs < runtime.snoozeWakeAt) return 'snoozed'
  if (nowMs < runtime.snoozeHoldUntil) return 'holding'
  return 'expired'
}

export function makeFinishingRuntime(
  runtime: SunriseRuntime,
  nowMs: number,
  outcome: 'finished' | 'cancelled',
  durationMs: number,
): SunriseRuntime {
  return {
    ...runtime,
    lifecycle: 'finishing',
    finishStartedAt: nowMs,
    finishEndsAt: nowMs + Math.max(0, durationMs),
    finishFromLevel: runtimeVisualFraction(runtime, nowMs),
    finishOutcome: outcome,
  }
}

export function finalizeRuntime(runtime: SunriseRuntime): SunriseRuntime {
  const outcome = runtime.finishOutcome ?? 'finished'
  return {
    ...IDLE_SUNRISE_RUNTIME,
    lifecycle: outcome,
  }
}
export function advanceSunriseRuntime(
  runtime: SunriseRuntime,
  nowMs: number,
  previousObservedAt: number,
  pageVisible: boolean,
): SunriseRuntime {
  if (!runtime.plan || runtime.lifecycle === 'idle' || runtime.lifecycle === 'finished' || runtime.lifecycle === 'cancelled') return runtime

  const refreshedPlan = refreshPlanForLocalTimezone(runtime.plan, nowMs)
  let next = refreshedPlan === runtime.plan ? runtime : { ...runtime, plan: refreshedPlan }

  if (next.lifecycle === 'finishing') {
    if (next.finishEndsAt !== null && nowMs >= next.finishEndsAt) return finalizeRuntime(next)
    return next
  }

  // A snoozed cycle owns its own absolute wake and hold timestamps even after it
  // transitions back to `holding`. Never fall back to the original plan.holdUntil.
  if (next.snoozeWakeAt !== null && next.snoozeHoldUntil !== null && (next.lifecycle === 'snoozed' || next.lifecycle === 'holding')) {
    const phase = snoozedPhase(next, nowMs)
    if (phase === 'snoozed') return next.lifecycle === 'snoozed' ? next : { ...next, lifecycle: 'snoozed' }
    if (phase === 'holding') return next.lifecycle === 'holding' ? next : { ...next, lifecycle: 'holding' }
    if (shouldFadeExpiredAlarm(previousObservedAt, nowMs, next.snoozeHoldUntil) && pageVisible) {
      return makeFinishingRuntime(next, nowMs, 'finished', SUNRISE_FINISH_FADE_MS)
    }
    return { ...IDLE_SUNRISE_RUNTIME, lifecycle: 'finished' }
  }

  const phase = phaseForPlan(refreshedPlan, nowMs)
  if (phase === 'expired') {
    if (shouldFadeExpiredAlarm(previousObservedAt, nowMs, refreshedPlan.holdUntil) && pageVisible) {
      return makeFinishingRuntime(next, nowMs, 'finished', SUNRISE_FINISH_FADE_MS)
    }
    return { ...IDLE_SUNRISE_RUNTIME, lifecycle: 'finished' }
  }
  return phase === next.lifecycle ? next : { ...next, lifecycle: phase }
}

