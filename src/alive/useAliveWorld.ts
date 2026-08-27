import { useEffect, useRef, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { LayerState, Scene } from '../types'
import { pitchWorld } from '../world/worldState'

export type AlivePhase =
  | 'calm'
  | 'rain-front'
  | 'rain'
  | 'storm'
  | 'clearing'
  | 'cold-front'
  | 'snow'

export type AliveSkyEvent = {
  id: number
  kind: 'shooting-star' | 'meteor-shower' | 'meteor-impact' | 'distant-flash' | 'moon-veil'
  startX?: number
  startY?: number
  travelX?: number
  travelY?: number
  duration?: number
  direction?: number
  count?: number
}

type UseAliveWorldOptions = {
  enabled: boolean
  setScene: Dispatch<SetStateAction<Scene>>
}

type AliveTimeline = {
  version: 1
  phase: AlivePhase
  nextPhase: AlivePhase
  phaseEndsAt: number
  weatherSpeed: number
}

const SECOND = 1_000
const MINUTE = 60_000
const ALIVE_TIMELINE_STORAGE_KEY = 'this-quiet-world-alive-timeline-v1'
const EMPTY_ALIVE_LAYERS: LayerState = { moon: false, storm: false, fireflies: false }

function between(min: number, max: number) {
  return min + Math.random() * (max - min)
}

function isAlivePhase(value: unknown): value is AlivePhase {
  return value === 'calm'
    || value === 'rain-front'
    || value === 'rain'
    || value === 'storm'
    || value === 'clearing'
    || value === 'cold-front'
    || value === 'snow'
}

function chooseNextFromCalm() {
  const roll = Math.random()
  if (roll < 0.42) return 'rain-front' as const
  if (roll < 0.72) return 'cold-front' as const
  return 'calm' as const
}

function makeTimeline(phase: AlivePhase, enteredAt: number, opening = false): AliveTimeline {
  if (phase === 'calm') {
    return {
      version: 1,
      phase,
      // A brand-new world still proves Alive is running fairly quickly. Once
      // established, later calm periods return to the slower overnight cadence.
      nextPhase: opening ? (Math.random() < 0.56 ? 'rain-front' : 'cold-front') : chooseNextFromCalm(),
      phaseEndsAt: enteredAt + between(opening ? 1.8 : 7, opening ? 3.0 : 18) * MINUTE,
      weatherSpeed: 1,
    }
  }

  if (phase === 'rain-front') {
    return {
      version: 1,
      phase,
      nextPhase: 'rain',
      phaseEndsAt: enteredAt + between(0.55, 1.15) * MINUTE,
      weatherSpeed: 1,
    }
  }

  if (phase === 'rain') {
    return {
      version: 1,
      phase,
      nextPhase: Math.random() < 0.34 ? 'storm' : 'clearing',
      phaseEndsAt: enteredAt + between(8, 18) * MINUTE,
      weatherSpeed: between(0.78, 1.02),
    }
  }

  if (phase === 'storm') {
    return {
      version: 1,
      phase,
      nextPhase: 'clearing',
      phaseEndsAt: enteredAt + between(6, 13) * MINUTE,
      weatherSpeed: between(0.98, 1.12),
    }
  }

  if (phase === 'clearing') {
    return {
      version: 1,
      phase,
      nextPhase: 'calm',
      phaseEndsAt: enteredAt + between(3, 7) * MINUTE,
      weatherSpeed: 1,
    }
  }

  if (phase === 'cold-front') {
    return {
      version: 1,
      phase,
      nextPhase: 'snow',
      phaseEndsAt: enteredAt + between(0.65, 1.25) * MINUTE,
      weatherSpeed: 1,
    }
  }

  return {
    version: 1,
    phase,
    nextPhase: 'clearing',
    phaseEndsAt: enteredAt + between(9, 21) * MINUTE,
    weatherSpeed: between(0.82, 1.02),
  }
}

function readTimeline(): AliveTimeline | null {
  if (typeof window === 'undefined') return null

  try {
    const raw = window.localStorage.getItem(ALIVE_TIMELINE_STORAGE_KEY)
    if (!raw) return null
    const saved = JSON.parse(raw) as Partial<AliveTimeline>
    if (saved.version !== 1) return null
    if (!isAlivePhase(saved.phase) || !isAlivePhase(saved.nextPhase)) return null
    if (typeof saved.phaseEndsAt !== 'number' || !Number.isFinite(saved.phaseEndsAt)) return null
    if (typeof saved.weatherSpeed !== 'number' || !Number.isFinite(saved.weatherSpeed)) return null
    return saved as AliveTimeline
  } catch {
    return null
  }
}

function saveTimeline(timeline: AliveTimeline) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(ALIVE_TIMELINE_STORAGE_KEY, JSON.stringify(timeline))
  } catch {
    // Alive still works as a normal in-session scheduler when storage is blocked.
  }
}

function resolveTimelineToNow(timeline: AliveTimeline, now: number) {
  let resolved = timeline
  let transitions = 0

  // Advance by scheduled wall-clock boundaries rather than pretending all missed
  // frames ran. A night/day away therefore moves Alive through the same kind of
  // weather sequence it would have had if the screen had stayed open.
  while (resolved.phaseEndsAt <= now && transitions < 4096) {
    resolved = makeTimeline(resolved.nextPhase, resolved.phaseEndsAt)
    transitions += 1
  }

  // Defensive fallback for an absurdly old/corrupt-but-valid timestamp. In normal
  // use even weeks away are comfortably below the guard.
  if (resolved.phaseEndsAt <= now) resolved = makeTimeline('calm', now)

  saveTimeline(resolved)
  return resolved
}

function averageSnowDepth() {
  const snow = pitchWorld.drifts
  if (snow.length < 3) return 0
  let total = 0
  const step = Math.max(1, Math.floor(snow.length / 36))
  let samples = 0
  for (let i = 1; i < snow.length - 1; i += step) {
    total += snow[i]
    samples += 1
  }
  return samples > 0 ? total / samples : 0
}

function canHostFireflies() {
  return pitchWorld.wetness < 0.30 && averageSnowDepth() < 8
}

export function useAliveWorld({ enabled, setScene }: UseAliveWorldOptions) {
  const [phase, setPhase] = useState<AlivePhase>('calm')
  const [weatherSpeed, setWeatherSpeed] = useState(1)
  const [fireflyMultiplier, setFireflyMultiplier] = useState(1)
  const [moonHalo, setMoonHalo] = useState(false)
  const [skyEvent, setSkyEvent] = useState<AliveSkyEvent | null>(null)
  const [aliveLayers, setAliveLayers] = useState<LayerState>(EMPTY_ALIVE_LAYERS)

  const aliveLayersRef = useRef<LayerState>(EMPTY_ALIVE_LAYERS)
  const phaseRef = useRef<AlivePhase>('calm')
  const timelineRef = useRef<AliveTimeline | null>(null)
  const eventIdRef = useRef(0)

  const patchAliveLayers = (patch: Partial<LayerState>) => {
    setAliveLayers((current) => {
      const next = { ...current, ...patch, moon: true }
      aliveLayersRef.current = next
      return next
    })
  }

  useEffect(() => {
    if (!enabled) {
      aliveLayersRef.current = EMPTY_ALIVE_LAYERS
      setAliveLayers(EMPTY_ALIVE_LAYERS)
      setMoonHalo(false)
      setFireflyMultiplier(1)
      setSkyEvent(null)
      return
    }

    let phaseTimer = 0
    let microTimer = 0
    let microEndTimer = 0
    let disposed = false

    const emitSkyEvent = (event: Omit<AliveSkyEvent, 'id'>) => {
      eventIdRef.current += 1
      setSkyEvent({ ...event, id: eventIdRef.current })
    }

    const scheduleMicro = (first = false) => {
      window.clearTimeout(microTimer)
      const delay = first ? between(12, 26) * SECOND : between(38, 92) * SECOND
      microTimer = window.setTimeout(runMicroEvent, delay)
    }

    const applyTimeline = (timeline: AliveTimeline, enteringLive = false) => {
      if (disposed) return
      timelineRef.current = timeline
      phaseRef.current = timeline.phase
      setPhase(timeline.phase)
      setWeatherSpeed(timeline.weatherSpeed)
      setMoonHalo(false)
      setFireflyMultiplier(1)

      if (timeline.phase === 'calm') {
        setScene('calm')
        patchAliveLayers({ storm: false, fireflies: false })
      } else if (timeline.phase === 'rain-front') {
        setScene('calm')
        patchAliveLayers({ storm: false, fireflies: false })
        // A front that is already underway when Alive resumes should still look
        // like a front rather than a mysterious calm pause.
        if (enteringLive) emitSkyEvent({ kind: 'moon-veil', duration: between(18_000, 32_000) })
      } else if (timeline.phase === 'rain') {
        setScene('rain')
        patchAliveLayers({ storm: false, fireflies: false })
      } else if (timeline.phase === 'storm') {
        setScene('rain')
        patchAliveLayers({ storm: true, fireflies: false })
      } else if (timeline.phase === 'clearing') {
        setScene('calm')
        patchAliveLayers({ storm: false, fireflies: false })
      } else if (timeline.phase === 'cold-front') {
        setScene('calm')
        patchAliveLayers({ storm: false, fireflies: false })
        if (enteringLive) emitSkyEvent({ kind: 'moon-veil', duration: between(20_000, 38_000) })
      } else {
        setScene('snow')
        patchAliveLayers({ storm: false, fireflies: false })
      }
    }

    const scheduleCurrentPhaseEnd = () => {
      window.clearTimeout(phaseTimer)
      const current = timelineRef.current
      if (!current) return
      const delay = Math.max(0, current.phaseEndsAt - Date.now())
      phaseTimer = window.setTimeout(syncTimelineToNow, delay)
    }

    function syncTimelineToNow() {
      if (disposed) return
      const current = timelineRef.current
      if (!current) return
      const resolved = resolveTimelineToNow(current, Date.now())
      const changed = resolved.phase !== current.phase
        || resolved.phaseEndsAt !== current.phaseEndsAt
        || resolved.nextPhase !== current.nextPhase

      if (changed) applyTimeline(resolved, true)
      scheduleCurrentPhaseEnd()
    }

    function runMicroEvent() {
      if (disposed) return
      window.clearTimeout(microEndTimer)
      // A new micro-event closes the previous transient cleanly rather than
      // allowing a long firefly/halo timer to be cancelled and left stuck on.
      setMoonHalo(false)
      setFireflyMultiplier(1)
      if (aliveLayersRef.current.fireflies) patchAliveLayers({ fireflies: false })
      const currentPhase = phaseRef.current

      if (currentPhase === 'storm') {
        // StormLayer already provides frequent cloud motion, flashes, forks and
        // thunder. Do not pile decorative events over the top of it.
        scheduleMicro()
        return
      }

      if (currentPhase === 'rain' || currentPhase === 'rain-front' || currentPhase === 'cold-front') {
        const roll = Math.random()
        if (roll < 0.54) {
          emitSkyEvent({ kind: 'moon-veil', duration: between(16_000, 34_000) })
        } else {
          emitSkyEvent({ kind: 'distant-flash', duration: between(1_100, 1_800) })
        }
        scheduleMicro()
        return
      }

      const roll = Math.random()

      if (roll < 0.20) {
        setMoonHalo(true)
        microEndTimer = window.setTimeout(() => setMoonHalo(false), between(24, 48) * SECOND)
      } else if (roll < 0.37 && canHostFireflies()) {
        patchAliveLayers({ fireflies: true })
        setFireflyMultiplier(between(1.55, 2.25))
        microEndTimer = window.setTimeout(() => {
          setFireflyMultiplier(1)
          patchAliveLayers({ fireflies: false })
        }, between(70, 180) * SECOND)
      } else if (roll < 0.55) {
        emitSkyEvent({
          kind: 'meteor-shower',
          direction: Math.random() < 0.5 ? 1 : -1,
          count: 4 + Math.floor(Math.random() * 4),
          duration: between(6_200, 9_000),
        })
      } else if (roll < 0.78) {
        const direction = Math.random() < 0.5 ? 1 : -1
        emitSkyEvent({
          kind: 'shooting-star',
          startX: direction > 0 ? between(8, 46) : between(54, 90),
          startY: between(6, 27),
          travelX: direction * between(46, 78),
          travelY: between(32, 68),
          duration: between(1_900, 3_100),
          direction,
        })
      } else if (roll < 0.98) {
        emitSkyEvent({ kind: 'moon-veil', duration: between(18_000, 36_000) })
      } else {
        // Rarely, one of the things crossing the sky actually reaches the world.
        // EmberScene consumes this without changing Alive into an "Ember scene".
        emitSkyEvent({ kind: 'meteor-impact' })
      }

      scheduleMicro()
    }

    const now = Date.now()
    const savedTimeline = readTimeline()
    const timeline = savedTimeline
      ? resolveTimelineToNow(savedTimeline, now)
      : makeTimeline('calm', now, true)

    if (!savedTimeline) saveTimeline(timeline)
    applyTimeline(timeline, savedTimeline !== null)
    scheduleCurrentPhaseEnd()
    scheduleMicro(true)

    const syncAfterVisibilityChange = () => {
      if (document.visibilityState === 'visible') syncTimelineToNow()
    }
    window.addEventListener('pageshow', syncTimelineToNow)
    document.addEventListener('visibilitychange', syncAfterVisibilityChange)

    return () => {
      disposed = true
      window.clearTimeout(phaseTimer)
      window.clearTimeout(microTimer)
      window.clearTimeout(microEndTimer)
      window.removeEventListener('pageshow', syncTimelineToNow)
      document.removeEventListener('visibilitychange', syncAfterVisibilityChange)
      aliveLayersRef.current = EMPTY_ALIVE_LAYERS
      setAliveLayers(EMPTY_ALIVE_LAYERS)
      setMoonHalo(false)
      setFireflyMultiplier(1)
      setSkyEvent(null)
    }
  }, [enabled, setScene])

  return { phase, weatherSpeed, fireflyMultiplier, moonHalo, skyEvent, aliveLayers }
}
