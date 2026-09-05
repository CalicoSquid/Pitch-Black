import { useCallback, useEffect, useRef, useState } from 'react'
import { Circle, Clock3, Expand, Shrink, Moon, Snowflake, CloudRain, CloudLightning, Flame, Sparkles, Volume2, VolumeX, Orbit } from 'lucide-react'
import './App.css'
import { AliveSkyEvents } from './alive/AliveSkyEvents'
import { AliveNightSky } from './alive/AliveNightSky'
import { AliveAmbience } from './alive/AliveAmbience'
import { AmbientLifeLayer } from './alive/AmbientLifeLayer'
import { useAliveWorld } from './alive/useAliveWorld'
import type { AliveSkyEvent, AmbientLifeEvent } from './alive/useAliveWorld'
import type { LayerKey, LayerState, Scene } from './types'
import {
  fadePitchAudioToSilence,
  restorePitchAudioFade,
  setPitchAudioMuted,
  setPitchAudioVolume,
  suspendPitchAudio,
  unlockPitchAudio,
} from './audio/pitchAudio'
import { warmPitchAudioBank } from './audio/audioAssets'
import { useIdleControls } from './hooks/useIdleControls'
import { FirefliesLayer } from './layers/FirefliesLayer'
import { GlobalMoon } from './layers/GlobalMoon'
import { StormLayer } from './layers/StormLayer'
import { RareGroundEventLayer, RareSkyEventLayer } from './layers/RareEventLayers'
import type { RareEventState } from './layers/RareEventLayers'
import { EmberScene } from './scenes/EmberScene'
import { RainScene } from './scenes/RainScene'
import { SnowScene } from './scenes/SnowScene'
import { WorldBaseScene } from './scenes/WorldBaseScene'
import { resetWorld, saveWorld } from './world/worldState'
import { ClockDisplay } from './ui/ClockDisplay'

type PitchPreferences = {
  scene: Scene
  showClock: boolean
  soundOn: boolean
  volume: number
  aliveOn: boolean
  layers: LayerState
}

type WakeLockSentinelLike = {
  release: () => Promise<void>
  addEventListener: (type: 'release', listener: () => void) => void
}

type WakeLockNavigator = Navigator & {
  wakeLock?: {
    request: (type: 'screen') => Promise<WakeLockSentinelLike>
  }
}

type BeforeInstallPromptEventLike = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

type VisualTestMode = 'fog' | 'storm' | 'moon-veil' | 'owl' | 'owl-army' | 'owl-ufo' | 'aurora' | 'supernova' | 'train' | 'lantern' | 'night' | 'rain' | 'heavy-rain' | 'snow-fade' | 'meteor' | 'meteor-shower'

const PREFERENCES_STORAGE_KEY = 'pitchblack-preferences-v2'
const FIRST_VISIT_STORAGE_KEY = 'this-quiet-world-welcomed-v2'
const SLEEP_FADE_MS = 60_000
const SLEEP_TIMER_OPTIONS = [30, 60, 120, 240] as const

const DEFAULT_PREFERENCES: PitchPreferences = {
  scene: 'black',
  showClock: false,
  soundOn: false,
  volume: 1,
  aliveOn: false,
  layers: { moon: false, storm: false, fireflies: false },
}

function readVisualTestMode(): VisualTestMode | null {
  if (typeof window === 'undefined') return null
  const test = new URLSearchParams(window.location.search).get('test')
  return test === 'fog' || test === 'storm' || test === 'moon-veil' || test === 'owl' || test === 'owl-army' || test === 'owl-ufo' || test === 'aurora' || test === 'supernova' || test === 'train' || test === 'lantern' || test === 'night' || test === 'rain' || test === 'heavy-rain' || test === 'snow-fade' || test === 'meteor' || test === 'meteor-shower' ? test : null
}

function readLanternTestOptions() {
  if (typeof window === 'undefined') return { reaction: null, weather: null } as const
  const params = new URLSearchParams(window.location.search)
  const reaction = params.get('reaction')
  const weather = params.get('weather')
  return {
    reaction: reaction === 'owl' || reaction === 'lightning' ? reaction : null,
    weather: weather === 'rain' || weather === 'snow' || weather === 'ember' ? weather : null,
  } as const
}

function readSharedWorld(): Partial<PitchPreferences> | null {
  if (typeof window === 'undefined') return null

  const params = new URLSearchParams(window.location.search)
  const world = params.get('world')
  if (world !== 'black' && world !== 'snow' && world !== 'rain' && world !== 'ember') return null

  const sharedAliveOn = params.get('alive') === '1'
  return {
    scene: world,
    aliveOn: sharedAliveOn,
    showClock: params.get('clock') === '1',
    soundOn: false,
    layers: sharedAliveOn
      ? { moon: false, storm: false, fireflies: false }
      : {
          moon: params.get('moon') === '1',
          storm: params.get('storm') === '1',
          fireflies: params.get('fireflies') === '1',
        },
  }
}

function buildSharedWorldUrl(scene: Scene, layers: LayerState, showClock: boolean, aliveOn: boolean) {
  const url = new URL(window.location.href)
  url.search = ''
  url.hash = ''
  url.searchParams.set('world', scene === 'calm' ? 'black' : scene)
  if (aliveOn) url.searchParams.set('alive', '1')
  if (!aliveOn && layers.moon) url.searchParams.set('moon', '1')
  if (!aliveOn && layers.storm) url.searchParams.set('storm', '1')
  if (!aliveOn && layers.fireflies) url.searchParams.set('fireflies', '1')
  if (showClock) url.searchParams.set('clock', '1')
  return url.toString()
}

function loadPreferences(): PitchPreferences {
  if (typeof window === 'undefined') return DEFAULT_PREFERENCES

  try {
    const raw = window.localStorage.getItem(PREFERENCES_STORAGE_KEY)
    if (!raw) {
      const shared = readSharedWorld()
      return shared
        ? { ...DEFAULT_PREFERENCES, ...shared, layers: shared.layers ?? DEFAULT_PREFERENCES.layers }
        : DEFAULT_PREFERENCES
    }
    const saved = JSON.parse(raw) as Partial<PitchPreferences>
    const savedAliveOn = typeof saved.aliveOn === 'boolean' ? saved.aliveOn : DEFAULT_PREFERENCES.aliveOn
    const validScene: Scene =
      saved.scene === 'black' || saved.scene === 'snow' || saved.scene === 'rain' || saved.scene === 'ember' || (saved.scene === 'calm' && savedAliveOn)
        ? saved.scene
        : DEFAULT_PREFERENCES.scene
    const savedVolume = typeof saved.volume === 'number' ? saved.volume : DEFAULT_PREFERENCES.volume

    const preferences: PitchPreferences = {
      scene: validScene,
      showClock: typeof saved.showClock === 'boolean' ? saved.showClock : DEFAULT_PREFERENCES.showClock,
      soundOn: typeof saved.soundOn === 'boolean' ? saved.soundOn : DEFAULT_PREFERENCES.soundOn,
      volume: Math.min(1, Math.max(0, savedVolume)),
      aliveOn: savedAliveOn,
      layers: savedAliveOn
        ? { moon: false, storm: false, fireflies: false }
        : {
            moon: typeof saved.layers?.moon === 'boolean' ? saved.layers.moon : DEFAULT_PREFERENCES.layers.moon,
            storm: typeof saved.layers?.storm === 'boolean' ? saved.layers.storm : DEFAULT_PREFERENCES.layers.storm,
            fireflies: typeof saved.layers?.fireflies === 'boolean' ? saved.layers.fireflies : DEFAULT_PREFERENCES.layers.fireflies,
          },
    }

    const shared = readSharedWorld()
    return shared
      ? { ...preferences, ...shared, layers: shared.layers ?? preferences.layers }
      : preferences
  } catch {
    const shared = readSharedWorld()
    return shared
      ? { ...DEFAULT_PREFERENCES, ...shared, layers: shared.layers ?? DEFAULT_PREFERENCES.layers }
      : DEFAULT_PREFERENCES
  }
}

function formatSleepRemaining(milliseconds: number) {
  const totalMinutes = Math.max(1, Math.ceil(milliseconds / 60_000))
  if (totalMinutes < 60) return `${totalMinutes}m`
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`
}

function App() {
  const testMode = readVisualTestMode()
  const lanternTest = testMode === 'lantern' ? readLanternTestOptions() : { reaction: null, weather: null }
  const [initialPreferences] = useState(loadPreferences)
  const [scene, setScene] = useState<Scene>(initialPreferences.scene)
  const [showClock, setShowClock] = useState(initialPreferences.showClock)
  const [soundOn, setSoundOn] = useState(initialPreferences.soundOn)
  const [volume, setVolume] = useState(initialPreferences.volume)
  const [aliveOn, setAliveOn] = useState(initialPreferences.aliveOn)
  const aliveRuntimeOn = aliveOn && testMode === null
  const [layers, setLayers] = useState<LayerState>(initialPreferences.layers)
  // Events belong to the world, not to Alive mode. Pure Black is the sole
  // opt-out; a black base with Moon/Storm/Fireflies is still a composed world.
  const manualBlack = !aliveOn && scene === 'black' && !layers.moon && !layers.storm && !layers.fireflies
  const worldEventsActive = testMode === null && !manualBlack
  const [showUtilities, setShowUtilities] = useState(false)
  const [fullscreenOn, setFullscreenOn] = useState(false)
  const [sleepTimerEndAt, setSleepTimerEndAt] = useState<number | null>(null)
  const [sleepTimerMinutes, setSleepTimerMinutes] = useState<number | null>(null)
  const [sleepTimerRemaining, setSleepTimerRemaining] = useState(0)
  const [keepAwake, setKeepAwake] = useState(false)
  const [wakeLockSupported] = useState(() => typeof navigator !== 'undefined' && 'wakeLock' in navigator)
  const [firstVisit, setFirstVisit] = useState(() => {
    if (testMode) return false
    if (typeof window === 'undefined') return false
    try {
      return window.localStorage.getItem(FIRST_VISIT_STORAGE_KEY) !== '1'
    } catch {
      return true
    }
  })
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEventLike | null>(null)
  const [shareStatus, setShareStatus] = useState<'idle' | 'copied' | 'shared'>('idle')
  const [testEventId, setTestEventId] = useState(51_100)
  const [testLanternOwlId, setTestLanternOwlId] = useState<number | null>(null)
  const [testSnowActive, setTestSnowActive] = useState(testMode === 'snow-fade')
  const wakeLockRef = useRef<WakeLockSentinelLike | null>(null)
  const shareStatusTimerRef = useRef<number | null>(null)
  const lastWorldTapRef = useRef<{ at: number; x: number; y: number } | null>(null)
  const controlsVisible = useIdleControls(4200)
  const {
    phase: alivePhase,
    eventPhase,
    weatherSpeed,
    fireflyMultiplier,
    eventFireflies,
    moonHalo,
    skyEvent,
    aliveLayers,
    rareEvents: aliveRareEvents,
    completeRareEvent: completeAliveRareEvent,
    ambientLifeEvents,
    completeAmbientLifeEvent,
  } = useAliveWorld({
    enabled: testMode === null,
    autonomous: aliveRuntimeOn,
    eventsEnabled: worldEventsActive,
    scene,
    manualStormActive: layers.storm,
    manualMoonVisible: layers.moon,
    setScene,
  })

  useEffect(() => {
    // The inline boot watchdog is intentionally independent of the React/Vite
    // bundle so unsupported embedded browsers never fail as a featureless
    // black rectangle. Reaching this effect means the real app mounted.
    document.documentElement.setAttribute('data-tqw-booted', '1')
    const fallback = document.getElementById('tqw-boot-fallback')
    if (fallback) fallback.style.display = 'none'
  }, [])

  useEffect(() => {
    if (testMode !== 'snow-fade') return
    let stopTimer = 0
    const beginCycle = () => {
      setTestSnowActive(true)
      window.clearTimeout(stopTimer)
      stopTimer = window.setTimeout(() => setTestSnowActive(false), 14_000)
    }
    beginCycle()
    const cycleTimer = window.setInterval(beginCycle, 110_000)
    return () => {
      window.clearTimeout(stopTimer)
      window.clearInterval(cycleTimer)
    }
  }, [testMode])

  useEffect(() => {
    if (testMode !== 'fog' && testMode !== 'moon-veil' && testMode !== 'owl' && testMode !== 'owl-army' && testMode !== 'owl-ufo' && testMode !== 'aurora' && testMode !== 'supernova' && testMode !== 'train' && testMode !== 'lantern' && testMode !== 'meteor' && testMode !== 'meteor-shower') return
    const interval = testMode === 'fog'
      ? 90_000
      : testMode === 'owl' || testMode === 'owl-army' || testMode === 'owl-ufo'
        ? 18_000
        : testMode === 'aurora'
          ? 100_000
          : testMode === 'supernova'
            ? 14_000
          : testMode === 'meteor' || testMode === 'meteor-shower'
            ? 11_000
          : testMode === 'train'
            ? 94_000
            : testMode === 'lantern'
              ? 138_000
              : 30_000
    const timer = window.setInterval(() => setTestEventId((id) => id + 1), interval)
    return () => window.clearInterval(timer)
  }, [testMode])


  useEffect(() => {
    if (testMode !== 'lantern' || lanternTest.reaction !== 'owl') {
      setTestLanternOwlId(null)
      return
    }
    setTestLanternOwlId(null)
    const timer = window.setTimeout(() => setTestLanternOwlId(testEventId + 90_000), 31_000)
    return () => window.clearTimeout(timer)
  }, [lanternTest.reaction, testEventId, testMode])

  const dismissFirstVisit = useCallback(() => {
    setFirstVisit(false)
    try {
      window.localStorage.setItem(FIRST_VISIT_STORAGE_KEY, '1')
    } catch {
      // The intro can safely reappear when storage is unavailable.
    }
  }, [])

  useEffect(() => {
    if (!firstVisit) return
    const dismiss = () => dismissFirstVisit()
    window.addEventListener('pointerdown', dismiss, { once: true, passive: true })
    window.addEventListener('mousedown', dismiss, { once: true, passive: true })
    window.addEventListener('click', dismiss, { once: true, passive: true })
    window.addEventListener('touchstart', dismiss, { once: true, passive: true })
    window.addEventListener('keydown', dismiss, { once: true })
    return () => {
      window.removeEventListener('pointerdown', dismiss)
      window.removeEventListener('mousedown', dismiss)
      window.removeEventListener('click', dismiss)
      window.removeEventListener('touchstart', dismiss)
      window.removeEventListener('keydown', dismiss)
    }
  }, [dismissFirstVisit, firstVisit])

  useEffect(() => {
    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault()
      setInstallPrompt(event as BeforeInstallPromptEventLike)
    }
    const handleInstalled = () => setInstallPrompt(null)

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    window.addEventListener('appinstalled', handleInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
      window.removeEventListener('appinstalled', handleInstalled)
    }
  }, [])

  useEffect(() => () => {
    if (shareStatusTimerRef.current !== null) window.clearTimeout(shareStatusTimerRef.current)
  }, [])

  useEffect(() => {
    if (!showUtilities) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setShowUtilities(false)
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [showUtilities])

  useEffect(() => {
    const id = window.setInterval(saveWorld, 15000)
    const persist = () => saveWorld()
    const persistWhenHidden = () => {
      if (document.visibilityState === 'hidden') saveWorld()
    }

    window.addEventListener('pagehide', persist)
    document.addEventListener('visibilitychange', persistWhenHidden)
    return () => {
      window.clearInterval(id)
      window.removeEventListener('pagehide', persist)
      document.removeEventListener('visibilitychange', persistWhenHidden)
      saveWorld()
    }
  }, [])

  const chooseScene = (nextScene: Scene) => {
    // Choosing a world is also the explicit "take control" gesture when Alive
    // is running. Manual composition starts clean rather than inheriting hidden
    // overlay choices from before Alive was enabled.
    if (aliveOn) setLayers({ moon: false, storm: false, fireflies: false })
    setAliveOn(false)
    // This runs synchronously inside the user's click, satisfying browser audio policy
    // before any later animation frame needs meteor/thunder/fire audio.
    unlockPitchAudio()
    setScene(nextScene)
  }

  const chooseBlackout = () => {
    setAliveOn(false)
    unlockPitchAudio()
    setScene('black')
    setShowClock(false)
    setLayers({ moon: false, storm: false, fireflies: false })
  }

  const toggleSound = () => {
    unlockPitchAudio()
    setSoundOn((value) => {
      const next = !value
      if (next) {
        const remaining = sleepTimerEndAt === null ? null : sleepTimerEndAt - Date.now()
        if (remaining !== null && remaining > 0 && remaining <= SLEEP_FADE_MS) {
          fadePitchAudioToSilence(remaining / 1000)
        } else {
          restorePitchAudioFade()
        }
      }
      return next
    })
  }

  const toggleLayer = (layer: LayerKey) => {
    if (layer === 'storm') unlockPitchAudio()

    if (aliveOn) {
      // Alive is a complete autonomous state. Touching any manual atmosphere
      // control means "I'll take it from here" and exits Alive immediately.
      setAliveOn(false)
      if (scene === 'calm') setScene('black')
      setLayers({
        moon: layer === 'moon',
        storm: layer === 'storm',
        fireflies: layer === 'fireflies',
      })
      return
    }

    setLayers((value) => ({ ...value, [layer]: !value[layer] }))
  }

  useEffect(() => {
    setPitchAudioMuted(!soundOn)
  }, [soundOn])

  useEffect(() => {
    setPitchAudioVolume(volume)
  }, [volume])

  useEffect(() => {
    if (!soundOn || document.visibilityState !== 'visible') return
    const audioCtx = unlockPitchAudio()
    if (!audioCtx) return

    // The complete real-audio bank is only ~7 MB. Decode it once when Sound is
    // enabled so rare events never wait on their first network/decode round-trip.
    // This does not start playback and is safe while autoplay policy keeps the
    // context suspended; the first user gesture will resume the prepared graph.
    void warmPitchAudioBank(audioCtx)
  }, [soundOn])

  useEffect(() => {
    // A hidden/backgrounded page should never keep sounding. Resume is attempted
    // when the page becomes visible again, while the gesture listeners remain as
    // a browser-policy fallback for mobile browsers that demand a fresh gesture.
    const prepareEnabledAudio = () => {
      if (!soundOn || document.visibilityState !== 'visible') return
      const audioCtx = unlockPitchAudio()
      if (audioCtx) void warmPitchAudioBank(audioCtx)
    }

    const syncAudioVisibility = () => {
      if (document.visibilityState !== 'visible') {
        suspendPitchAudio()
        return
      }
      prepareEnabledAudio()
    }

    const suspendForPageHide = () => suspendPitchAudio()
    const unlockOnGesture = () => prepareEnabledAudio()

    document.addEventListener('visibilitychange', syncAudioVisibility)
    window.addEventListener('pagehide', suspendForPageHide)
    window.addEventListener('pageshow', syncAudioVisibility)

    // Capture phase makes the audio unlock happen before whichever control/world
    // interaction the user actually intended. Sound persisted ON therefore needs
    // one ordinary browser gesture after a fresh load, never a mute/unmute cycle.
    document.addEventListener('pointerdown', unlockOnGesture, { capture: true, passive: true })
    document.addEventListener('mousedown', unlockOnGesture, { capture: true, passive: true })
    document.addEventListener('click', unlockOnGesture, { capture: true, passive: true })
    document.addEventListener('touchstart', unlockOnGesture, { capture: true, passive: true })
    document.addEventListener('touchend', unlockOnGesture, { capture: true, passive: true })
    document.addEventListener('keydown', unlockOnGesture, true)

    syncAudioVisibility()

    return () => {
      document.removeEventListener('visibilitychange', syncAudioVisibility)
      window.removeEventListener('pagehide', suspendForPageHide)
      window.removeEventListener('pageshow', syncAudioVisibility)
      document.removeEventListener('pointerdown', unlockOnGesture, true)
      document.removeEventListener('mousedown', unlockOnGesture, true)
      document.removeEventListener('click', unlockOnGesture, true)
      document.removeEventListener('touchstart', unlockOnGesture, true)
      document.removeEventListener('touchend', unlockOnGesture, true)
      document.removeEventListener('keydown', unlockOnGesture, true)
    }
  }, [soundOn])

  useEffect(() => {
    try {
      window.localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify({
        scene,
        showClock,
        soundOn,
        volume,
        aliveOn,
        layers,
      } satisfies PitchPreferences))
    } catch {
      // Preferences are optional in private/restricted browser contexts.
    }
  }, [scene, showClock, soundOn, volume, aliveOn, layers])

  const cancelSleepTimer = useCallback(() => {
    setSleepTimerEndAt(null)
    setSleepTimerMinutes(null)
    setSleepTimerRemaining(0)
    restorePitchAudioFade()
  }, [])

  const setSleepTimer = (minutes: number) => {
    unlockPitchAudio()
    restorePitchAudioFade()
    const duration = minutes * 60_000
    setSleepTimerEndAt(Date.now() + duration)
    setSleepTimerMinutes(minutes)
    setSleepTimerRemaining(duration)
  }

  useEffect(() => {
    if (sleepTimerEndAt === null) return

    const finishAt = sleepTimerEndAt
    let fadeTimeout = 0
    let finishTimeout = 0
    let remainingInterval = 0

    const finishTimer = () => {
      setPitchAudioMuted(true)
      setSoundOn(false)
      setSleepTimerEndAt(null)
      setSleepTimerMinutes(null)
      setSleepTimerRemaining(0)
    }

    const schedule = () => {
      const remaining = finishAt - Date.now()
      setSleepTimerRemaining(Math.max(0, remaining))

      if (remaining <= 0) {
        finishTimer()
        return
      }

      if (remaining <= SLEEP_FADE_MS) {
        fadePitchAudioToSilence(remaining / 1000)
      } else {
        fadeTimeout = window.setTimeout(() => {
          const fadeRemaining = Math.max(0.05, (finishAt - Date.now()) / 1000)
          fadePitchAudioToSilence(Math.min(SLEEP_FADE_MS / 1000, fadeRemaining))
        }, remaining - SLEEP_FADE_MS)
      }

      finishTimeout = window.setTimeout(finishTimer, remaining)
      remainingInterval = window.setInterval(() => {
        const nextRemaining = finishAt - Date.now()
        setSleepTimerRemaining(Math.max(0, nextRemaining))
      }, 15_000)
    }

    schedule()

    return () => {
      window.clearTimeout(fadeTimeout)
      window.clearTimeout(finishTimeout)
      window.clearInterval(remainingInterval)
    }
  }, [sleepTimerEndAt])

  const releaseWakeLock = useCallback(async () => {
    const sentinel = wakeLockRef.current
    wakeLockRef.current = null
    if (!sentinel) return
    try {
      await sentinel.release()
    } catch {
      // Releasing an already-released wake lock is harmless.
    }
  }, [])

  const acquireWakeLock = useCallback(async () => {
    if (!wakeLockSupported || document.visibilityState !== 'visible') return false
    const wakeLock = (navigator as WakeLockNavigator).wakeLock
    if (!wakeLock) return false

    try {
      const sentinel = await wakeLock.request('screen')
      wakeLockRef.current = sentinel
      sentinel.addEventListener('release', () => {
        if (wakeLockRef.current === sentinel) wakeLockRef.current = null
      })
      return true
    } catch {
      return false
    }
  }, [wakeLockSupported])

  const toggleKeepAwake = async () => {
    if (keepAwake) {
      setKeepAwake(false)
      await releaseWakeLock()
      return
    }

    const acquired = await acquireWakeLock()
    if (acquired) setKeepAwake(true)
  }

  useEffect(() => {
    if (!keepAwake) return

    const reacquireWhenVisible = () => {
      if (document.visibilityState === 'visible' && !wakeLockRef.current) {
        void acquireWakeLock()
      }
    }

    document.addEventListener('visibilitychange', reacquireWhenVisible)
    return () => document.removeEventListener('visibilitychange', reacquireWhenVisible)
  }, [acquireWakeLock, keepAwake])

  useEffect(() => () => {
    void releaseWakeLock()
  }, [releaseWakeLock])

  const showTransientShareStatus = (status: 'copied' | 'shared') => {
    setShareStatus(status)
    if (shareStatusTimerRef.current !== null) window.clearTimeout(shareStatusTimerRef.current)
    shareStatusTimerRef.current = window.setTimeout(() => setShareStatus('idle'), 1800)
  }

  const shareWorld = async () => {
    const url = buildSharedWorldUrl(scene, layers, showClock, aliveOn)
    const shareData = { title: 'This Quiet World', text: 'A living black screen for sleep.', url }

    try {
      if (typeof navigator.share === 'function') {
        await navigator.share(shareData)
        showTransientShareStatus('shared')
      } else {
        await navigator.clipboard.writeText(url)
        showTransientShareStatus('copied')
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      try {
        await navigator.clipboard.writeText(url)
        showTransientShareStatus('copied')
      } catch {
        window.prompt('Copy this world', url)
      }
    }
  }

  const installApp = async () => {
    if (!installPrompt) return
    await installPrompt.prompt()
    const choice = await installPrompt.userChoice
    if (choice.outcome === 'accepted') setInstallPrompt(null)
  }

  const toggleAlive = () => {
    unlockPitchAudio()

    if (aliveOn) {
      setAliveOn(false)
      if (scene === 'calm') setScene('black')
    } else {
      // Alive owns the complete world. Clear manual atmosphere choices so there
      // is never a hidden additive state waiting underneath it.
      setLayers({ moon: false, storm: false, fireflies: false })
      // Alive resumes its own persisted wall-clock timeline. The hook restores
      // whichever phase should be happening now, so do not force a fresh calm
      // world here.
      setAliveOn(true)
    }

    setShowUtilities(false)
  }

  useEffect(() => {
    const syncFullscreenState = () => {
      const doc = document as Document & { webkitFullscreenElement?: Element | null }
      setFullscreenOn(Boolean(document.fullscreenElement ?? doc.webkitFullscreenElement))
    }

    document.addEventListener('fullscreenchange', syncFullscreenState)
    document.addEventListener('webkitfullscreenchange', syncFullscreenState as EventListener)
    syncFullscreenState()
    return () => {
      document.removeEventListener('fullscreenchange', syncFullscreenState)
      document.removeEventListener('webkitfullscreenchange', syncFullscreenState as EventListener)
    }
  }, [])

  const goFullscreen = async () => {
    unlockPitchAudio()
    try {
      const doc = document as Document & {
        webkitFullscreenElement?: Element | null
        webkitExitFullscreen?: () => Promise<void> | void
      }
      const root = document.documentElement as HTMLElement & {
        webkitRequestFullscreen?: () => Promise<void> | void
      }
      const fullscreenElement = document.fullscreenElement ?? doc.webkitFullscreenElement

      if (!fullscreenElement) {
        if (typeof root.requestFullscreen === 'function') await root.requestFullscreen()
        else if (typeof root.webkitRequestFullscreen === 'function') await root.webkitRequestFullscreen()
      } else if (typeof document.exitFullscreen === 'function') {
        await document.exitFullscreen()
      } else if (typeof doc.webkitExitFullscreen === 'function') {
        await doc.webkitExitFullscreen()
      }
    } catch {
      // Fullscreen support varies by browser; failure is harmless.
    }
  }

  const isWorldSurfaceTarget = (target: EventTarget | null) => {
    if (!(target instanceof Element)) return true
    return !target.closest('button, input, label, .control-dock, .utility-panel')
  }

  const handleWorldPointerDown = (event: React.PointerEvent<HTMLElement>) => {
    if (isWorldSurfaceTarget(event.target)) setShowUtilities(false)
  }

  const handleWorldDoubleClick = (event: React.MouseEvent<HTMLElement>) => {
    if (!isWorldSurfaceTarget(event.target)) return
    void goFullscreen()
  }

  const handleWorldPointerUp = (event: React.PointerEvent<HTMLElement>) => {
    if (event.pointerType === 'mouse' || !isWorldSurfaceTarget(event.target)) return

    const now = performance.now()
    const previous = lastWorldTapRef.current
    lastWorldTapRef.current = { at: now, x: event.clientX, y: event.clientY }
    if (!previous) return

    const closeInTime = now - previous.at <= 360
    const closeInSpace = Math.hypot(event.clientX - previous.x, event.clientY - previous.y) <= 32
    if (!closeInTime || !closeInSpace) return

    lastWorldTapRef.current = null
    void goFullscreen()
  }

  const normalDisplayLayers: LayerState = aliveRuntimeOn
    ? aliveLayers
    : layers
  const displayLayers: LayerState = testMode === 'fog'
    ? { moon: false, storm: false, fireflies: false }
    : testMode === 'storm'
      ? { moon: true, storm: true, fireflies: false }
    : testMode === 'moon-veil'
      ? { moon: true, storm: false, fireflies: false }
    : testMode === 'train' || testMode === 'lantern'
      ? { moon: true, storm: testMode === 'lantern' && lanternTest.reaction === 'lightning', fireflies: false }
    : testMode === 'owl' || testMode === 'owl-ufo' || testMode === 'aurora' || testMode === 'night' || testMode === 'rain' || testMode === 'heavy-rain' || testMode === 'meteor' || testMode === 'meteor-shower'
      ? { moon: false, storm: false, fireflies: false }
      : normalDisplayLayers
  const displayScene: Scene = testMode === 'rain' || testMode === 'heavy-rain'
    ? 'rain'
    : testMode === 'snow-fade'
      ? (testSnowActive ? 'snow' : 'calm')
      : testMode === 'lantern'
        ? (lanternTest.weather ?? (lanternTest.reaction === 'lightning' ? 'rain' : 'calm'))
        : testMode === 'fog' || testMode === 'owl' || testMode === 'owl-army' || testMode === 'owl-ufo' || testMode === 'aurora' || testMode === 'supernova' || testMode === 'train' || testMode === 'night' || testMode === 'meteor' || testMode === 'meteor-shower'
          ? 'calm'
          : scene
  const testFogEvent: RareEventState | null = testMode === 'fog'
    ? { kind: 'ground-fog', id: testEventId }
    : null
  const testOwlEvent: RareEventState | null = testMode === 'owl' || testMode === 'owl-army' || testMode === 'owl-ufo'
    ? { kind: testMode === 'owl-ufo' ? 'owl-ufo' : testMode === 'owl-army' ? 'owl-army' : 'owl', id: testEventId }
    : testMode === 'lantern' && testLanternOwlId !== null
      ? { kind: 'owl', id: testLanternOwlId }
      : null
  const testAuroraEvent: RareEventState | null = testMode === 'aurora'
    ? { kind: 'aurora', id: testEventId }
    : null
  const testSupernovaEvent: RareEventState | null = testMode === 'supernova'
    ? { kind: 'supernova', id: testEventId }
    : null
  const testMoonVeilEvent: AliveSkyEvent | null = testMode === 'moon-veil'
    ? { id: testEventId, kind: 'moon-veil', duration: 26_000 }
    : null
  const testMeteorEvent: AliveSkyEvent | null = testMode === 'meteor'
    ? { id: testEventId, kind: 'shooting-star', startX: 22, startY: 18, travelX: 58, travelY: 78, duration: 3_200, direction: 1 }
    : testMode === 'meteor-shower'
      ? { id: testEventId, kind: 'meteor-shower', direction: 1, count: 7, duration: 8_000 }
      : null
  const testTrainEvent: AmbientLifeEvent | null = testMode === 'train'
    ? {
        id: testEventId,
        kind: 'train',
        duration: 90_000,
        direction: testEventId % 2 === 0 ? -1 : 1,
        startY: 80.0,
        travelY: -3.1,
        startScale: 1.05,
        endScale: 0.76,
        horn: true,
        hornDelay: 12_000,
      }
    : null
  const testLanternEvent: AmbientLifeEvent | null = testMode === 'lantern' && lanternTest.weather !== 'ember'
    ? {
        id: testEventId,
        kind: 'lantern',
        duration: 132_000,
        direction: testEventId % 2 === 0 ? -1 : 1,
        startScale: 0.98,
        endScale: 1.04,
      }
    : null
  const sleepTimerActive = sleepTimerEndAt !== null
  const blackoutActive = !aliveRuntimeOn && displayScene === 'black' && !showClock && !displayLayers.moon && !displayLayers.storm && !displayLayers.fireflies
  const interfaceAwake = controlsVisible || showUtilities || firstVisit

  return (
    <main
      className={`pitchblack ${interfaceAwake ? 'interface-awake' : 'interface-asleep'}`}
      data-scene={displayScene}
      data-layer-moon={displayLayers.moon ? 'on' : 'off'}
      data-layer-storm={displayLayers.storm ? 'on' : 'off'}
      data-layer-fireflies={displayLayers.fireflies ? 'on' : 'off'}
      data-alive={aliveRuntimeOn ? 'on' : 'off'}
      data-alive-phase={alivePhase}
      onPointerDown={handleWorldPointerDown}
      onDoubleClick={handleWorldDoubleClick}
      onPointerUp={handleWorldPointerUp}
    >
      <div className="scene-layer">
        {(aliveRuntimeOn || testMode === 'aurora' || testMode === 'supernova' || testMode === 'train' || testMode === 'lantern') && <AliveNightSky phase={testMode === 'train' || testMode === 'lantern' ? 'calm' : alivePhase} />}
        {worldEventsActive && aliveRareEvents.filter((event) => event.kind !== 'ground-fog').map((event) => (
          <RareSkyEventLayer
            key={`alive-rare-sky-${event.kind}-${event.id}`}
            event={event}
            soundOn={soundOn}
            onComplete={completeAliveRareEvent}
          />
        ))}
        {testOwlEvent && (
          <RareSkyEventLayer
            key={`test-owl-${testOwlEvent.id}`}
            event={testOwlEvent}
            soundOn={soundOn}
          />
        )}
        {testAuroraEvent && (
          <RareSkyEventLayer
            key={`test-aurora-${testAuroraEvent.id}`}
            event={testAuroraEvent}
            soundOn={false}
          />
        )}
        {testSupernovaEvent && (
          <RareSkyEventLayer
            key={`test-supernova-${testSupernovaEvent.id}`}
            event={testSupernovaEvent}
            soundOn={false}
          />
        )}
        <GlobalMoon visible={displayLayers.moon} halo={worldEventsActive && displayLayers.moon && moonHalo} />
        {worldEventsActive && ambientLifeEvents.map((event) => (
          <AmbientLifeLayer
            key={`ambient-life-${event.kind}-${event.id}`}
            event={event}
            soundOn={soundOn}
            phase={eventPhase}
            onComplete={completeAmbientLifeEvent}
          />
        ))}
        {testTrainEvent && (
          <AmbientLifeLayer
            key={`test-train-${testTrainEvent.id}`}
            event={testTrainEvent}
            soundOn={soundOn}
            phase="calm"
          />
        )}
        {testLanternEvent && (
          <AmbientLifeLayer
            key={`test-lantern-${testLanternEvent.id}`}
            event={testLanternEvent}
            soundOn={soundOn}
            phase={lanternTest.weather === 'snow' ? 'snow' : lanternTest.reaction === 'lightning' || lanternTest.weather === 'rain' ? 'rain' : 'calm'}
          />
        )}
        <div className={`world-weather-layer ${displayScene === 'black' ? 'world-hidden' : ''}`}>
          <WorldBaseScene scene={displayScene} />
          {worldEventsActive && aliveRareEvents.filter((event) => event.kind === 'ground-fog').map((event) => (
            <RareGroundEventLayer
              key={`alive-rare-ground-${event.kind}-${event.id}`}
              event={event}
              onComplete={completeAliveRareEvent}
            />
          ))}
          {testFogEvent && <RareGroundEventLayer key={`test-fog-${testFogEvent.id}`} event={testFogEvent} />}
          <SnowScene
            active={displayScene === 'snow'}
            alive={testMode === 'snow-fade' ? !testSnowActive : aliveRuntimeOn}
            soundOn={soundOn}
            speed={testMode === 'snow-fade' ? (testSnowActive ? 0.87 : 1) : aliveRuntimeOn ? weatherSpeed : 1}
          />
          <RainScene
            active={displayScene === 'rain'}
            alive={aliveRuntimeOn}
            soundOn={soundOn}
            speed={aliveRuntimeOn ? weatherSpeed : 1}
            audioTest={testMode === 'rain' ? 'steady' : testMode === 'heavy-rain' ? 'heavy' : undefined}
          />
          <EmberScene
            active={displayScene === 'ember'}
            rainActive={displayScene === 'rain'}
            snowActive={displayScene === 'snow'}
            speed={1}
            soundOn={soundOn}
            visible={displayScene !== 'black'}
            externalMeteorId={worldEventsActive && skyEvent?.kind === 'meteor-impact' ? skyEvent.id : 0}
          />
        </div>
        <FirefliesLayer
          active={displayLayers.fireflies || (worldEventsActive && eventFireflies)}
          visible
          abundance={worldEventsActive && eventFireflies ? fireflyMultiplier : 1}
        />
        <AliveSkyEvents event={testMeteorEvent ?? testMoonVeilEvent ?? (worldEventsActive ? skyEvent : null)} />
        <StormLayer
          active={displayLayers.storm}
          scene={displayScene}
          soundOn={soundOn}
          groundStrikeChance={testMode === 'lantern' && lanternTest.reaction === 'lightning' ? 0 : aliveRuntimeOn ? 0.14 : 0.42}
          forceFirstGroundStrikeAfterMs={testMode === 'lantern' && lanternTest.reaction === 'lightning' ? 22_000 : undefined}
          depthRevealEventId={worldEventsActive && skyEvent?.kind === 'depth-flash' ? skyEvent.id : 0}
        />
        <AliveAmbience
          active={aliveRuntimeOn || testMode === 'train' || testMode === 'owl' || testMode === 'night' || testMode === 'rain' || testMode === 'heavy-rain'}
          soundOn={soundOn}
          phase={testMode === 'train' || testMode === 'owl' || testMode === 'night' ? 'calm' : testMode === 'rain' || testMode === 'heavy-rain' ? 'rain' : alivePhase}
        />
      </div>


      {showClock && <ClockDisplay awake={controlsVisible} />}

      <div className={`first-visit-whisper ${firstVisit ? 'visible' : ''}`} aria-hidden={!firstVisit}>
        <h1 className="first-visit-title">This Quiet World</h1>
        <div className="first-visit-hint">A living black screen for sleep. Choose a scene below, or let <strong>Alive</strong> take over.</div>
        <div className="first-visit-secondary">Double-tap anywhere for fullscreen.</div>
      </div>

      <div
        className={`brand-whisper ${interfaceAwake && !firstVisit ? 'visible' : ''}`}
        aria-hidden="true"
      >
        <span>this quiet world</span>
      </div>

      <section
        id="pitchblack-utilities"
        className={`utility-panel ${showUtilities ? 'visible' : ''}`}
        aria-hidden={!showUtilities}
        inert={!showUtilities}
        aria-label="This quiet world settings"
      >
        <div className="utility-section">
          <div className="utility-section-title">Sleep</div>
          <div className="utility-row utility-timer-row">
            <span className="utility-label">Fade out</span>
            <div className="sleep-timer-options">
              <button type="button" className={!sleepTimerActive ? 'active' : ''} onClick={cancelSleepTimer}>Off</button>
              {SLEEP_TIMER_OPTIONS.map((minutes) => (
                <button
                  type="button"
                  key={minutes}
                  className={sleepTimerMinutes === minutes ? 'active' : ''}
                  onClick={() => setSleepTimer(minutes)}
                >
                  {minutes < 60 ? `${minutes}m` : `${minutes / 60}h`}
                </button>
              ))}
            </div>
          </div>

          {sleepTimerActive && (
            <div className="sleep-timer-status" aria-live="polite">
              sound fades during the final minute · {formatSleepRemaining(sleepTimerRemaining)} left
            </div>
          )}

          <label className="utility-row volume-row">
            <span className="utility-label">Volume</span>
            <input
              type="range"
              min="0"
              max="100"
              step="1"
              value={Math.round(volume * 100)}
              onChange={(event) => {
                unlockPitchAudio()
                setVolume(Number(event.target.value) / 100)
              }}
              aria-label="Master volume"
            />
            <output>{Math.round(volume * 100)}%</output>
          </label>
        </div>

        {wakeLockSupported && (
          <div className="utility-section">
            <div className="utility-section-title">Display</div>
            <button
              type="button"
              className={`utility-toggle-row ${keepAwake ? 'active' : ''}`}
              onClick={() => void toggleKeepAwake()}
              aria-pressed={keepAwake}
            >
              <span>Keep screen on</span>
              <span className="quiet-switch" aria-hidden="true"><i /></span>
            </button>
          </div>
        )}

        <div className="utility-section utility-actions">
          <div className="utility-section-title">World</div>
          <button type="button" onClick={() => void shareWorld()}>
            {shareStatus === 'copied' ? 'Link copied' : shareStatus === 'shared' ? 'Shared' : 'Share this world'}
          </button>
          <button
            type="button"
            onClick={() => {
              resetWorld()
              setShowUtilities(false)
            }}
          >
            Reset world
          </button>
        </div>

        {installPrompt && (
          <div className="utility-section utility-actions">
            <div className="utility-section-title">App</div>
            <button type="button" onClick={() => void installApp()}>
              Install this quiet world
            </button>
          </div>
        )}

        <div className="utility-section utility-about">
          <div className="utility-section-title">About</div>
          <h2>This Quiet World</h2>
          <p className="utility-about-tagline">A living black screen for sleep.</p>
          <p>
            A free, ad-free ambient sleep website with rain, snow, storms, embers, moonlight,
            fireflies, gentle night sounds, a dim bedside clock and fullscreen mode.
          </p>
          <p>
            Choose a scene yourself, or let <strong>Alive</strong> carry the weather, water and
            ice forward on its own. The quiet nighttime events belong to the world either way.
            No account, feed or distractions.
          </p>
          <a className="utility-about-link" href="/about/">About &amp; how it works</a>
        </div>
      </section>

      <nav className={`control-dock ${interfaceAwake ? 'visible' : ''} ${aliveOn ? 'alive-running' : ''}`} aria-label="This quiet world controls">
        <button type="button" className={`alive-control ${aliveOn ? 'active alive-active' : ''}`} onClick={toggleAlive} aria-label={aliveOn ? 'Stop Alive mode' : 'Let the world live on its own'} aria-pressed={aliveOn}>
          <Orbit size={17} strokeWidth={1.5} />
          <span>Alive</span>
        </button>
        <div className="dock-divider" aria-hidden="true" />
        <button type="button" className={`manual-world-control ${blackoutActive ? 'active' : ''}`} onClick={chooseBlackout} aria-label="Black: clear the visible world to pure black" aria-pressed={blackoutActive}>
          <Circle size={17} strokeWidth={1.5} />
          <span>Black</span>
        </button>
        <div className="dock-divider" aria-hidden="true" />
        <button type="button" className={`manual-world-control ${!aliveOn && scene === 'snow' ? 'active' : ''}`} onClick={() => chooseScene('snow')} aria-label="Snow scene" aria-pressed={!aliveOn && scene === 'snow'}>
          <Snowflake size={17} strokeWidth={1.5} />
          <span>Snow</span>
        </button>
        <button type="button" className={`manual-world-control ${!aliveOn && scene === 'rain' ? 'active' : ''}`} onClick={() => chooseScene('rain')} aria-label="Rain scene" aria-pressed={!aliveOn && scene === 'rain'}>
          <CloudRain size={17} strokeWidth={1.5} />
          <span>Rain</span>
        </button>
        <button type="button" className={`manual-world-control ${!aliveOn && scene === 'ember' ? 'active' : ''}`} onClick={() => chooseScene('ember')} aria-label="Ember scene" aria-pressed={!aliveOn && scene === 'ember'}>
          <Flame size={17} strokeWidth={1.5} />
          <span>Ember</span>
        </button>
        <div className="dock-divider" aria-hidden="true" />
        <button type="button" className={`manual-world-control ${!aliveOn && layers.moon ? 'active' : ''}`} onClick={() => toggleLayer('moon')} aria-label="Toggle moon" aria-pressed={!aliveOn && layers.moon}>
          <Moon size={17} strokeWidth={1.5} />
          <span>Moon</span>
        </button>
        <button type="button" className={`manual-world-control ${!aliveOn && layers.storm ? 'active' : ''}`} onClick={() => toggleLayer('storm')} aria-label="Toggle storm layer" aria-pressed={!aliveOn && layers.storm}>
          <CloudLightning size={17} strokeWidth={1.5} />
          <span>Storm</span>
        </button>
        <button type="button" className={`manual-world-control ${!aliveOn && layers.fireflies ? 'active' : ''}`} onClick={() => toggleLayer('fireflies')} aria-label="Toggle fireflies layer" aria-pressed={!aliveOn && layers.fireflies}>
          <Sparkles size={17} strokeWidth={1.5} />
          <span>Fireflies</span>
        </button>
        <div className="dock-divider" aria-hidden="true" />
        <button type="button" className={showClock ? 'active' : ''} onClick={() => setShowClock((value) => !value)} aria-label="Toggle clock" aria-pressed={showClock}>
          <Clock3 size={17} strokeWidth={1.5} />
          <span>Clock</span>
        </button>
        <button type="button" className={soundOn ? 'active' : ''} onClick={toggleSound} aria-label={soundOn ? 'Mute all sound' : 'Enable all sound'} aria-pressed={soundOn}>
          {soundOn ? <Volume2 size={17} strokeWidth={1.5} /> : <VolumeX size={17} strokeWidth={1.5} />}
          <span>{soundOn ? 'Sound' : 'Muted'}</span>
        </button>
        <button type="button" className={fullscreenOn ? 'active' : ''} onClick={() => void goFullscreen()} aria-label={fullscreenOn ? 'Exit fullscreen' : 'Enter fullscreen'} aria-pressed={fullscreenOn}>
          {fullscreenOn ? <Shrink size={17} strokeWidth={1.5} /> : <Expand size={17} strokeWidth={1.5} />}
          <span>Fullscreen</span>
        </button>
        <button
          type="button"
          className={`more-control ${showUtilities ? 'active' : ''}`}
          onClick={() => setShowUtilities((value) => !value)}
          aria-expanded={showUtilities}
          aria-controls="pitchblack-utilities"
          aria-label="More settings"
        >
          <span className="more-glyph" aria-hidden="true">•••</span>
          <span>More</span>
        </button>
      </nav>
    </main>
  )
}

export default App
