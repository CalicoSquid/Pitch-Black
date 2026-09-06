import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { SunriseAudioController, type SunriseAudioStatus } from './sunriseAudio'
import {
  DEFAULT_SUNRISE_SETTINGS,
  IDLE_SUNRISE_RUNTIME,
  SUNRISE_CANCEL_FADE_MS,
  SUNRISE_FINISH_FADE_MS,
  advanceSunriseRuntime,
  createSunrisePlan,
  makeArmedRuntime,
  makeFinishingRuntime,
  makeSnoozedRuntime,
  phaseForPlan,
  runtimeMorningAmbienceFraction,
  runtimeVisualFraction,
  type SunriseRuntime,
  type SunriseSettings,
} from './sunriseLogic'

const SUNRISE_SETUP_STORAGE_KEY = 'this-quiet-world-sunrise-setup-v1'
const PREVIEW_DURATION_MS = 24_000
const PREVIEW_EXIT_FADE_MS = 2_000

type PreviewExit = {
  startedAt: number
  fromFraction: number
}

function smoothstep01(value: number) {
  const t = Math.min(1, Math.max(0, value))
  return t * t * (3 - 2 * t)
}

function previewRiseFraction(startedAt: number, nowMs: number) {
  return smoothstep01((nowMs - startedAt) / PREVIEW_DURATION_MS)
}

function previewExitFraction(exit: PreviewExit, nowMs: number) {
  return Math.max(0, exit.fromFraction * (1 - smoothstep01((nowMs - exit.startedAt) / PREVIEW_EXIT_FADE_MS)))
}

type UseSunriseAlarmOptions = {
  initialSetupOpen?: boolean
  wakeLockSupported: boolean
  alarmWakeLockReady: boolean
  requestAlarmWakeLock: () => Promise<boolean>
  releaseAlarmWakeLock: () => Promise<void>
  setNightAudioMix: (level: number) => void
}

function readSetupPreferences(): SunriseSettings {
  if (typeof window === 'undefined') return DEFAULT_SUNRISE_SETTINGS
  try {
    const raw = window.localStorage.getItem(SUNRISE_SETUP_STORAGE_KEY)
    if (!raw) return DEFAULT_SUNRISE_SETTINGS
    const saved = JSON.parse(raw) as Partial<SunriseSettings>
    const durationMinutes = saved.durationMinutes === 10 || saved.durationMinutes === 20 || saved.durationMinutes === 30
      ? saved.durationMinutes
      : DEFAULT_SUNRISE_SETTINGS.durationMinutes
    return {
      wakeTime: typeof saved.wakeTime === 'string' && /^\d{1,2}:\d{2}$/.test(saved.wakeTime)
        ? saved.wakeTime
        : DEFAULT_SUNRISE_SETTINGS.wakeTime,
      durationMinutes,
      finalIntensity: typeof saved.finalIntensity === 'number'
        ? Math.min(1, Math.max(0.25, saved.finalIntensity))
        : DEFAULT_SUNRISE_SETTINGS.finalIntensity,
      wakeVolume: typeof saved.wakeVolume === 'number'
        ? Math.min(1, Math.max(0, saved.wakeVolume))
        : DEFAULT_SUNRISE_SETTINGS.wakeVolume,
    }
  } catch {
    return DEFAULT_SUNRISE_SETTINGS
  }
}

function isRuntimeActive(runtime: SunriseRuntime) {
  return runtime.plan !== null && runtime.lifecycle !== 'finished' && runtime.lifecycle !== 'cancelled' && runtime.lifecycle !== 'idle'
}

export function useSunriseAlarm({
  initialSetupOpen = false,
  wakeLockSupported,
  alarmWakeLockReady,
  requestAlarmWakeLock,
  releaseAlarmWakeLock,
  setNightAudioMix,
}: UseSunriseAlarmOptions) {
  const [settings, setSettings] = useState<SunriseSettings>(readSetupPreferences)
  const [runtime, setRuntime] = useState<SunriseRuntime>(IDLE_SUNRISE_RUNTIME)
  const [setupOpen, setSetupOpen] = useState(initialSetupOpen)
  const [now, setNow] = useState(() => Date.now())
  const [audioStatus, setAudioStatus] = useState<SunriseAudioStatus>('idle')
  const [armAudioReady, setArmAudioReady] = useState(false)
  const [previewStartedAt, setPreviewStartedAt] = useState<number | null>(null)
  const [previewExit, setPreviewExit] = useState<PreviewExit | null>(null)
  const [previewChimed, setPreviewChimed] = useState(false)
  const [arming, setArming] = useState(false)
  const lastObservedAtRef = useRef(Date.now())
  const runtimeRef = useRef(runtime)
  const previewStartedRef = useRef<number | null>(null)
  const previewExitRef = useRef<PreviewExit | null>(null)
  const releaseTimerRef = useRef<number | null>(null)
  const audioRef = useRef<SunriseAudioController | null>(null)
  const actionGenerationRef = useRef(0)

  runtimeRef.current = runtime
  previewStartedRef.current = previewStartedAt
  previewExitRef.current = previewExit

  const getAudio = useCallback(() => {
    if (!audioRef.current) {
      audioRef.current = new SunriseAudioController()
      audioRef.current.setStatusListener(setAudioStatus)
    }
    return audioRef.current
  }, [])

  const clearReleaseTimer = useCallback(() => {
    if (releaseTimerRef.current === null) return
    window.clearTimeout(releaseTimerRef.current)
    releaseTimerRef.current = null
  }, [])

  const releaseAlarmResources = useCallback(async (fadeSeconds = 0.6) => {
    clearReleaseTimer()
    const audio = audioRef.current
    audioRef.current = null
    if (audio) {
      audio.setStatusListener(null)
      await audio.release(fadeSeconds)
      setAudioStatus('idle')
    }
    await releaseAlarmWakeLock()
    setArmAudioReady(false)
  }, [clearReleaseTimer, releaseAlarmWakeLock])

  useEffect(() => {
    try {
      window.localStorage.setItem(SUNRISE_SETUP_STORAGE_KEY, JSON.stringify(settings))
    } catch {
      // Setup defaults can remain in memory when storage is unavailable.
    }
  }, [settings])

  const active = isRuntimeActive(runtime)
  const previewActive = previewStartedAt !== null || previewExit !== null

  useEffect(() => {
    if (!active && !previewActive && !setupOpen) return
    let timer = 0
    const tick = () => setNow(Date.now())
    tick()
    timer = window.setInterval(tick, previewActive ? 100 : active ? 1_000 : 30_000)
    return () => window.clearInterval(timer)
  }, [active, previewActive, setupOpen])

  useEffect(() => {
    if (!active) {
      lastObservedAtRef.current = now
      return
    }

    setRuntime((current) => advanceSunriseRuntime(
      current,
      now,
      lastObservedAtRef.current,
      document.visibilityState === 'visible',
    ))
    lastObservedAtRef.current = now
  }, [active, now])

  // Release ownership only after a lifecycle has genuinely ended. Finishing keeps
  // the wake lock/audio graph long enough to complete its quiet visual/audio exit.
  useEffect(() => {
    if (runtime.lifecycle !== 'finished' && runtime.lifecycle !== 'cancelled') return
    setNightAudioMix(1)
    void releaseAlarmResources(runtime.lifecycle === 'finished' ? 0.8 : 0.25)
    const reset = window.setTimeout(() => setRuntime(IDLE_SUNRISE_RUNTIME), 1_500)
    return () => window.clearTimeout(reset)
  }, [releaseAlarmResources, runtime.lifecycle, setNightAudioMix])

  useEffect(() => {
    if (!runtime.plan) return
    const audio = getAudio()
    const planId = runtime.plan.id
    const wakeStillHolding = () => {
      const latest = runtimeRef.current
      return latest.lifecycle === 'holding' && latest.plan?.id === planId
    }
    if (runtime.lifecycle === 'holding') {
      if (runtime.plan.wakeVolume > 0.001) {
        // Morning ambience is already arriving during dawn when possible. Holding
        // also starts it at full level after a suspended/late tab resume.
        void audio.updateMorningAmbience(1, runtime.plan.wakeVolume, wakeStillHolding, 2.5)
        void audio.startWake(runtime.plan.wakeVolume, wakeStillHolding)
      } else audio.soften(1.2)
    } else if (runtime.lifecycle === 'snoozed') {
      audio.soften(2.5)
    } else if (runtime.lifecycle === 'finishing') {
      const seconds = runtime.finishStartedAt !== null && runtime.finishEndsAt !== null
        ? Math.max(0.5, (runtime.finishEndsAt - runtime.finishStartedAt) / 1000)
        : SUNRISE_FINISH_FADE_MS / 1000
      audio.soften(seconds)
    }
  }, [getAudio, runtime.finishEndsAt, runtime.finishStartedAt, runtime.lifecycle, runtime.plan])

  useEffect(() => {
    const syncVisibility = () => {
      const current = runtimeRef.current
      if (document.visibilityState !== 'visible' || !isRuntimeActive(current)) return
      setNow(Date.now())
      if (current.plan && current.plan.wakeVolume > 0.001) {
        const audio = getAudio()
        void audio.prepare().then((ready) => {
          setArmAudioReady(ready)
          const latest = runtimeRef.current
          if (ready && latest.lifecycle === 'holding' && latest.plan) {
            const planId = latest.plan.id
            const stillHolding = () => {
              const currentRuntime = runtimeRef.current
              return currentRuntime.lifecycle === 'holding' && currentRuntime.plan?.id === planId
            }
            void audio.updateMorningAmbience(1, latest.plan.wakeVolume, stillHolding, 1.5)
            void audio.startWake(latest.plan.wakeVolume, stillHolding)
          }
        })
      }
    }
    document.addEventListener('visibilitychange', syncVisibility)
    window.addEventListener('pageshow', syncVisibility)
    return () => {
      document.removeEventListener('visibilitychange', syncVisibility)
      window.removeEventListener('pageshow', syncVisibility)
    }
  }, [getAudio])

  useEffect(() => () => {
    actionGenerationRef.current += 1
    clearReleaseTimer()
    setNightAudioMix(1)
    const audio = audioRef.current
    audioRef.current = null
    audio?.disposeNow()
    void releaseAlarmWakeLock()
  }, [clearReleaseTimer, releaseAlarmWakeLock, setNightAudioMix])

  const planPreview = useMemo(() => createSunrisePlan(settings, now, 0), [now, settings])

  const runtimeFraction = runtimeVisualFraction(runtime, now)
  const previewFraction = previewStartedAt !== null
    ? previewRiseFraction(previewStartedAt, now)
    : previewExit !== null
      ? previewExitFraction(previewExit, now)
      : 0
  const visualFraction = previewActive ? previewFraction : runtimeFraction
  const finalIntensity = previewActive ? settings.finalIntensity : runtime.plan?.finalIntensity ?? settings.finalIntensity
  const visualLevel = Math.min(1, visualFraction * finalIntensity)

  useEffect(() => {
    if (visualFraction <= 0.0005) {
      setNightAudioMix(1)
      return
    }
    setNightAudioMix(Math.max(0.18, 1 - visualFraction * 0.82))
  }, [setNightAudioMix, visualFraction])

  // Let the natural morning bed arrive only in the latter part of dawn. The
  // controller keeps the compressed asset small while armed and defers decoded
  // PCM until this effect actually reaches the audible portion of sunrise.
  useEffect(() => {
    if (previewStartedAt !== null) {
      const previewId = previewStartedAt
      // A zero wake-volume slider is an explicit silence command for a source
      // that may already be running from earlier in the preview.
      void getAudio().updateMorningAmbience(
        previewFraction,
        settings.wakeVolume,
        () => previewStartedRef.current === previewId && previewExitRef.current === null,
        0.45,
      )
      return
    }

    if ((runtime.lifecycle !== 'dawn' && runtime.lifecycle !== 'snoozed') || !runtime.plan) return
    const planId = runtime.plan.id

    // Snooze owns a quiet middle section. Birds remain fully stopped until the
    // final re-rise rather than following the initial visual soften-down and
    // accidentally cancelling their scheduled stop.
    const snoozeBirdProgress = runtimeMorningAmbienceFraction(runtime, now)

    void getAudio().updateMorningAmbience(
      snoozeBirdProgress,
      runtime.plan.wakeVolume,
      () => {
        const latest = runtimeRef.current
        return (latest.lifecycle === 'dawn' || latest.lifecycle === 'snoozed' || latest.lifecycle === 'holding') && latest.plan?.id === planId
      },
      6,
    )
  }, [getAudio, now, previewFraction, previewStartedAt, runtime.lifecycle, runtime.plan, runtime.snoozeWakeAt, runtimeFraction, settings.wakeVolume])

  useEffect(() => {
    if (previewStartedAt === null) return
    const elapsed = now - previewStartedAt
    if (!previewChimed && elapsed >= PREVIEW_DURATION_MS * 0.78 && settings.wakeVolume > 0.001) {
      setPreviewChimed(true)
      void getAudio().previewChime(settings.wakeVolume)
    }
    if (elapsed < PREVIEW_DURATION_MS) return

    // Hold the overlay while it explicitly fades out. Unmounting it here would
    // bypass the CSS transition and make preview completion visibly snap to night.
    setPreviewStartedAt(null)
    setPreviewExit({ startedAt: now, fromFraction: 1 })
    setPreviewChimed(false)
    audioRef.current?.soften(PREVIEW_EXIT_FADE_MS / 1000)
  }, [getAudio, now, previewChimed, previewStartedAt, settings.wakeVolume])

  useEffect(() => {
    if (previewExit === null || now < previewExit.startedAt + PREVIEW_EXIT_FADE_MS) return
    setPreviewExit(null)
    setNightAudioMix(1)
    const audio = audioRef.current
    if (audio && !isRuntimeActive(runtimeRef.current)) {
      clearReleaseTimer()
      audioRef.current = null
      audio.setStatusListener(null)
      void audio.release(0.5)
      setAudioStatus('idle')
    }
  }, [clearReleaseTimer, now, previewExit, setNightAudioMix])

  const updateSettings = useCallback(<K extends keyof SunriseSettings>(key: K, value: SunriseSettings[K]) => {
    setSettings((current) => ({ ...current, [key]: value }))
  }, [])

  const arm = useCallback(async () => {
    if (arming || previewStartedRef.current !== null || previewExitRef.current !== null) return false
    const armedAt = Date.now()
    const plan = createSunrisePlan(settings, armedAt, armedAt)
    if (!plan) return false
    const actionGeneration = ++actionGenerationRef.current
    setArming(true)
    clearReleaseTimer()
    setNow(armedAt)
    setPreviewStartedAt(null)
    setPreviewExit(null)
    setPreviewChimed(false)
    setNightAudioMix(1)

    const audio = getAudio()
    // Sound Check may have decoded the field recording. Arming is a boundary:
    // stop transient check playback and drop decoded PCM, while retaining only
    // the small compressed asset for late-dawn decode.
    audio.resetForArmedWaiting()
    // These capability requests stay inside the Arm button gesture. The action
    // generation prevents a slow resume()/wake-lock promise from arming after
    // the user has already cancelled, edited, or left the component.
    const [audioReady] = await Promise.all([
      audio.prepare(),
      requestAlarmWakeLock(),
    ])

    if (actionGeneration !== actionGenerationRef.current) {
      if (audioRef.current === audio) {
        audioRef.current = null
        audio.setStatusListener(null)
        void audio.release(0.2)
      }
      await releaseAlarmWakeLock()
      return false
    }

    setArming(false)
    setArmAudioReady(audioReady)
    // Prime only the compressed (~1.2 MB) CC0 field recording. Decoding waits
    // until late dawn so arming an overnight alarm does not pin its PCM in RAM.
    if (audioReady && plan.wakeVolume > 0.001) void audio.preloadMorningAsset()
    const initial = makeArmedRuntime(plan)
    const phase = phaseForPlan(plan, Date.now())
    setRuntime(phase === 'expired' ? { ...IDLE_SUNRISE_RUNTIME, lifecycle: 'finished' } : { ...initial, lifecycle: phase })
    setSetupOpen(false)
    lastObservedAtRef.current = Date.now()
    return true
  }, [arming, clearReleaseTimer, getAudio, releaseAlarmWakeLock, requestAlarmWakeLock, setNightAudioMix, settings])

  const cancel = useCallback(() => {
    actionGenerationRef.current += 1
    setArming(false)
    const current = runtimeRef.current
    if (!isRuntimeActive(current)) {
      setRuntime({ ...IDLE_SUNRISE_RUNTIME, lifecycle: 'cancelled' })
      void releaseAlarmResources(0.2)
      return
    }
    const nowMs = Date.now()
    setNow(nowMs)
    if (runtimeVisualFraction(current, nowMs) > 0.01) {
      setRuntime(makeFinishingRuntime(current, nowMs, 'cancelled', SUNRISE_CANCEL_FADE_MS))
      audioRef.current?.soften(0.8)
    } else {
      setRuntime({ ...IDLE_SUNRISE_RUNTIME, lifecycle: 'cancelled' })
    }
  }, [releaseAlarmResources])

  const edit = useCallback(() => {
    actionGenerationRef.current += 1
    setArming(false)
    setSetupOpen(true)
    const current = runtimeRef.current
    const nowMs = Date.now()
    setNow(nowMs)

    // Editing during visible dawn/morning is still a cancellation, but retain the
    // overlay through its short exit instead of dropping the layer in one frame.
    if (isRuntimeActive(current) && runtimeVisualFraction(current, nowMs) > 0.01) {
      audioRef.current?.soften(SUNRISE_CANCEL_FADE_MS / 1000)
      setRuntime(makeFinishingRuntime(current, nowMs, 'cancelled', SUNRISE_CANCEL_FADE_MS))
      return
    }

    setNightAudioMix(1)
    setRuntime(IDLE_SUNRISE_RUNTIME)
    const audio = audioRef.current
    audioRef.current = null
    if (audio) {
      audio.setStatusListener(null)
      void audio.release(0.3)
      setAudioStatus('idle')
    }
    void releaseAlarmWakeLock()
    setArmAudioReady(false)
  }, [releaseAlarmWakeLock, setNightAudioMix])

  const finish = useCallback(() => {
    const current = runtimeRef.current
    if (!isRuntimeActive(current)) return
    const nowMs = Date.now()
    setNow(nowMs)
    audioRef.current?.soften(SUNRISE_FINISH_FADE_MS / 1000)
    setRuntime(makeFinishingRuntime(current, nowMs, 'finished', SUNRISE_FINISH_FADE_MS))
  }, [])

  const snooze = useCallback(() => {
    const current = runtimeRef.current
    if (!current.plan || current.lifecycle !== 'holding') return
    const nowMs = Date.now()
    setNow(nowMs)
    setRuntime(makeSnoozedRuntime(current, nowMs))
    audioRef.current?.soften(2.5)
  }, [])

  const soundCheck = useCallback(async () => {
    if (settings.wakeVolume <= 0.001) return false
    clearReleaseTimer()
    const audio = getAudio()
    const played = await audio.soundCheck(settings.wakeVolume)
    if (!active && !previewActive) {
      releaseTimerRef.current = window.setTimeout(() => {
        if (isRuntimeActive(runtimeRef.current) || previewStartedRef.current !== null || previewExitRef.current !== null) return
        const controller = audioRef.current
        audioRef.current = null
        controller?.setStatusListener(null)
        void controller?.release(0.45)
        setAudioStatus('idle')
      }, 5_000)
    }
    return played
  }, [active, clearReleaseTimer, getAudio, previewActive, settings.wakeVolume])

  const preview = useCallback(async () => {
    if (active || previewStartedRef.current !== null || previewExitRef.current !== null) return false
    const actionGeneration = ++actionGenerationRef.current
    clearReleaseTimer()
    const audio = getAudio()
    const ready = await audio.prepare()
    if (actionGeneration !== actionGenerationRef.current) return false
    if (settings.wakeVolume > 0.001) {
      setArmAudioReady(ready)
      if (ready) void audio.preloadMorningAsset()
    }
    const startedAt = Date.now()
    setNow(startedAt)
    setPreviewStartedAt(startedAt)
    setPreviewChimed(false)
    return true
  }, [active, clearReleaseTimer, getAudio, settings.wakeVolume])

  const stopPreview = useCallback(() => {
    actionGenerationRef.current += 1
    const startedAt = previewStartedRef.current
    if (startedAt === null) return
    const nowMs = Date.now()
    const fromFraction = previewRiseFraction(startedAt, nowMs)
    setNow(nowMs)
    setPreviewStartedAt(null)
    setPreviewExit({ startedAt: nowMs, fromFraction })
    setPreviewChimed(false)
    audioRef.current?.soften(PREVIEW_EXIT_FADE_MS / 1000)
  }, [])

  return {
    settings,
    updateSettings,
    setupOpen,
    setSetupOpen,
    runtime,
    active,
    now,
    planPreview,
    audioStatus,
    armAudioReady,
    wakeLockSupported,
    alarmWakeLockReady,
    visualLevel,
    visualFraction,
    previewActive,
    previewExiting: previewExit !== null,
    previewProgress: previewFraction,
    arming,
    arm,
    edit,
    cancel,
    finish,
    snooze,
    soundCheck,
    preview,
    stopPreview,
  }
}
