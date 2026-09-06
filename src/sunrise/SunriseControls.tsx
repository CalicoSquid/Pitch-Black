import { SUNRISE_DURATION_OPTIONS, SUNRISE_SNOOZE_MS } from './sunriseLogic'
import type { useSunriseAlarm } from './useSunriseAlarm'

type SunriseController = ReturnType<typeof useSunriseAlarm>

function formatTime(timestamp: number) {
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date(timestamp))
}

function formatWakeConfirmation(timestamp: number, now: number) {
  const wake = new Date(timestamp)
  const today = new Date(now)
  const tomorrow = new Date(now)
  tomorrow.setDate(tomorrow.getDate() + 1)

  let prefix: string
  if (wake.toDateString() === today.toDateString()) prefix = 'Today'
  else if (wake.toDateString() === tomorrow.toDateString()) prefix = 'Tomorrow'
  else prefix = new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric' }).format(wake)
  return `${prefix}, ${formatTime(timestamp)}`
}

function formatMinutes(ms: number) {
  const minutes = Math.max(1, Math.round(ms / 60_000))
  return `${minutes} minute${minutes === 1 ? '' : 's'}`
}

export function SunriseControls({ sunrise, sleepTimerActive }: { sunrise: SunriseController; sleepTimerActive: boolean }) {
  const plan = sunrise.runtime.plan
  const activeWakeAt = sunrise.runtime.lifecycle === 'snoozed' && sunrise.runtime.snoozeWakeAt !== null
    ? sunrise.runtime.snoozeWakeAt
    : plan?.wakeAt ?? null
  const holding = sunrise.runtime.lifecycle === 'holding'
  const snoozed = sunrise.runtime.lifecycle === 'snoozed'
  const finishing = sunrise.runtime.lifecycle === 'finishing'
  const previewPlan = sunrise.planPreview

  return (
    <div className="sunrise-controls">
      {!sunrise.active && !finishing && (
        <div id="sunrise-setup" className="sunrise-setup">
          <label className="sunrise-field sunrise-time-field">
            <span>Wake at</span>
            <input
              type="time"
              value={sunrise.settings.wakeTime}
              onChange={(event) => sunrise.updateSettings('wakeTime', event.target.value)}
              aria-label="Sunrise wake-up time"
            />
          </label>

          {previewPlan && (
            <div className="sunrise-confirmation" aria-live="polite">
              <strong>{formatWakeConfirmation(previewPlan.wakeAt, sunrise.now)}</strong>
              <span>Chosen time is when dawn reaches its selected brightness.</span>
              <span>
                Dawn begins at {formatTime(previewPlan.startAt)}
                {previewPlan.shortened
                  ? ` — shortened to ${formatMinutes(previewPlan.actualDurationMs)} because wake-up is closer than ${sunrise.settings.durationMinutes} minutes.`
                  : ` — ${sunrise.settings.durationMinutes} minutes before wake-up.`}
              </span>
            </div>
          )}

          <fieldset className="sunrise-fieldset">
            <legend>Sunrise length</legend>
            <div className="sunrise-choice-row">
              {SUNRISE_DURATION_OPTIONS.map((minutes) => (
                <button
                  type="button"
                  key={minutes}
                  className={sunrise.settings.durationMinutes === minutes ? 'active' : ''}
                  onClick={() => sunrise.updateSettings('durationMinutes', minutes)}
                  aria-pressed={sunrise.settings.durationMinutes === minutes}
                >
                  {minutes}m
                </button>
              ))}
            </div>
          </fieldset>

          <label className="sunrise-field sunrise-range-field">
            <span>Final glow</span>
            <input
              type="range"
              min="25"
              max="100"
              step="1"
              value={Math.round(sunrise.settings.finalIntensity * 100)}
              onChange={(event) => sunrise.updateSettings('finalIntensity', Number(event.target.value) / 100)}
              aria-label="Final sunrise visual intensity"
            />
            <output>{Math.round(sunrise.settings.finalIntensity * 100)}%</output>
          </label>

          <label className="sunrise-field sunrise-range-field">
            <span>Wake sound</span>
            <input
              type="range"
              min="0"
              max="100"
              step="1"
              value={Math.round(sunrise.settings.wakeVolume * 100)}
              onChange={(event) => sunrise.updateSettings('wakeVolume', Number(event.target.value) / 100)}
              aria-label="Wake-up sound level"
            />
            <output>{Math.round(sunrise.settings.wakeVolume * 100)}%</output>
          </label>

          <div className="sunrise-check-row">
            <button type="button" onClick={() => void sunrise.soundCheck()} disabled={sunrise.settings.wakeVolume <= 0.001}>
              Sound check
            </button>
            <button type="button" onClick={() => void sunrise.preview()} disabled={sunrise.previewActive}>
              {sunrise.previewExiting ? 'Fading…' : sunrise.previewActive ? 'Previewing…' : 'Preview sunrise'}
            </button>
            {sunrise.previewActive && !sunrise.previewExiting && <button type="button" onClick={sunrise.stopPreview}>Stop</button>}
          </div>

          {sunrise.previewActive && (
            <div className="sunrise-preview-status" aria-live="polite">
              {sunrise.previewExiting ? 'preview fading back to night' : `accelerated preview · ${Math.round(sunrise.previewProgress * 100)}%`}
            </div>
          )}

          <p className="sunrise-browser-note">Keep TQW open and your device volume audible. This browser wake-up cannot run reliably when the page is closed or the device is locked.</p>
          {sleepTimerActive && <p className="sunrise-browser-note">Your sleep timer fades night sound only. Sunrise will still wake you.</p>}

          <button type="button" className="sunrise-arm" onClick={() => void sunrise.arm()} disabled={sunrise.arming || sunrise.previewActive}>
            {sunrise.arming ? 'Preparing sunrise…' : 'Arm sunrise'}
          </button>
        </div>
      )}

      {(sunrise.active || finishing) && plan && (
        <div className="sunrise-armed" aria-live="polite">
          <div className="sunrise-armed-head">
            <span>{snoozed ? 'Snoozed' : finishing ? 'Finishing' : holding ? 'Morning' : sunrise.runtime.lifecycle === 'dawn' ? 'Dawn' : 'Sunrise armed'}</span>
            {activeWakeAt !== null && <strong>{formatWakeConfirmation(activeWakeAt, sunrise.now)}</strong>}
          </div>

          <div className="sunrise-readiness">
            <span className={plan.wakeVolume <= 0.001 ? 'quiet' : sunrise.armAudioReady && sunrise.audioStatus === 'ready' ? 'ready' : 'not-ready'}>
              {plan.wakeVolume <= 0.001
                ? 'Wake sound off by choice'
                : sunrise.armAudioReady && sunrise.audioStatus === 'ready'
                  ? 'Wake sound ready'
                  : 'Wake sound not currently ready'}
            </span>
            <span className={sunrise.alarmWakeLockReady ? 'ready' : 'not-ready'}>
              {sunrise.alarmWakeLockReady
                ? 'Screen wake lock active'
                : sunrise.wakeLockSupported
                  ? 'Screen wake lock not active'
                  : 'Screen wake lock unsupported'}
            </span>
          </div>

          {!holding && !snoozed && !finishing && (
            <div className="sunrise-armed-note">
              Dawn {sunrise.runtime.lifecycle === 'dawn' ? 'is rising now' : `begins at ${formatTime(plan.startAt)}`} and reaches {Math.round(plan.finalIntensity * 100)}% at {formatTime(plan.wakeAt)}.
            </div>
          )}
          {snoozed && sunrise.runtime.snoozeWakeAt !== null && (
            <div className="sunrise-armed-note">Daylight is softened now and will rise again for {formatTime(sunrise.runtime.snoozeWakeAt)}.</div>
          )}
          {finishing && <div className="sunrise-armed-note">Sunrise and wake sound are fading away. Your current world settings stay as they are.</div>}

          <div className="sunrise-active-actions">
            {holding && <button type="button" onClick={sunrise.snooze}>Snooze {Math.round(SUNRISE_SNOOZE_MS / 60_000)} min</button>}
            {holding && <button type="button" onClick={sunrise.finish}>Finish</button>}
            {!holding && !finishing && <button type="button" onClick={sunrise.edit}>Edit</button>}
            {!finishing && <button type="button" onClick={sunrise.cancel}>Cancel</button>}
          </div>

          <div className="sunrise-browser-note">Keep this page open. Background, locked-screen and closed-page alarms cannot be guaranteed by a browser.</div>
        </div>
      )}
    </div>
  )
}
