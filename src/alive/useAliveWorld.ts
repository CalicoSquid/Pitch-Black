import { useCallback, useEffect, useRef, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { LayerState, Scene } from '../types'
import type { RareEventKind, RareEventState } from '../layers/RareEventLayers'
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
  kind: 'shooting-star' | 'meteor-shower' | 'meteor-impact' | 'distant-flash' | 'depth-flash' | 'moon-veil'
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

type AliveHeroSchedule = {
  version: 1
  auroraNextAt: number
  greatMeteorNextAt: number
}

const SECOND = 1_000
const MINUTE = 60_000
const HOUR = 60 * MINUTE
const ALIVE_TIMELINE_STORAGE_KEY = 'this-quiet-world-alive-timeline-v1'
const ALIVE_HERO_STORAGE_KEY = 'this-quiet-world-alive-hero-events-v1'
const EMPTY_ALIVE_LAYERS: LayerState = { moon: false, storm: false, fireflies: false }

function between(min: number, max: number) {
  return min + Math.random() * (max - min)
}

function nextAuroraAt(from: number) {
  return from + between(6, 10) * HOUR
}

function nextGreatMeteorAt(from: number) {
  return from + between(3, 6) * HOUR
}

function isAliveRareMicroKind(kind: RareEventKind) {
  return kind === 'distant-storm' || kind === 'ground-fog' || kind === 'impossible-star' || kind === 'owl'
}

function isAliveHeroKind(kind: RareEventKind) {
  return kind === 'aurora' || kind === 'great-meteor'
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

function readHeroSchedule(): AliveHeroSchedule | null {
  if (typeof window === 'undefined') return null

  try {
    const raw = window.localStorage.getItem(ALIVE_HERO_STORAGE_KEY)
    if (!raw) return null
    const saved = JSON.parse(raw) as Partial<AliveHeroSchedule>
    if (saved.version !== 1) return null
    if (typeof saved.auroraNextAt !== 'number' || !Number.isFinite(saved.auroraNextAt)) return null
    if (typeof saved.greatMeteorNextAt !== 'number' || !Number.isFinite(saved.greatMeteorNextAt)) return null
    return saved as AliveHeroSchedule
  } catch {
    return null
  }
}

function saveHeroSchedule(schedule: AliveHeroSchedule) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(ALIVE_HERO_STORAGE_KEY, JSON.stringify(schedule))
  } catch {
    // Hero events still schedule normally for the current session if storage is blocked.
  }
}

function makeHeroSchedule(now: number): AliveHeroSchedule {
  return {
    version: 1,
    auroraNextAt: nextAuroraAt(now),
    greatMeteorNextAt: nextGreatMeteorAt(now),
  }
}

function resolveHeroScheduleToNow(schedule: AliveHeroSchedule, now: number) {
  let auroraNextAt = schedule.auroraNextAt
  let greatMeteorNextAt = schedule.greatMeteorNextAt
  let guard = 0

  // Hero sightings that happened while nobody was watching stay missed. Advance
  // their wall-clock schedule rather than replaying a backlog when the tab returns.
  while (auroraNextAt <= now && guard < 1024) {
    auroraNextAt = nextAuroraAt(auroraNextAt)
    guard += 1
  }

  guard = 0
  while (greatMeteorNextAt <= now && guard < 2048) {
    greatMeteorNextAt = nextGreatMeteorAt(greatMeteorNextAt)
    guard += 1
  }

  const resolved = (auroraNextAt <= now || greatMeteorNextAt <= now)
    ? makeHeroSchedule(now)
    : { version: 1 as const, auroraNextAt, greatMeteorNextAt }

  saveHeroSchedule(resolved)
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
  const [rareEvents, setRareEvents] = useState<RareEventState[]>([])

  const aliveLayersRef = useRef<LayerState>(EMPTY_ALIVE_LAYERS)
  const rareEventsRef = useRef<RareEventState[]>([])
  const phaseRef = useRef<AlivePhase>('calm')
  const timelineRef = useRef<AliveTimeline | null>(null)
  const heroScheduleRef = useRef<AliveHeroSchedule | null>(null)
  const eventIdRef = useRef(0)
  const rareEventIdRef = useRef(0)

  const patchAliveLayers = (patch: Partial<LayerState>) => {
    setAliveLayers((current) => {
      const next = { ...current, ...patch, moon: true }
      aliveLayersRef.current = next
      return next
    })
  }

  const completeRareEvent = useCallback((kind: RareEventKind, id: number) => {
    setRareEvents((current) => {
      const next = current.filter((event) => !(event.kind === kind && event.id === id))
      rareEventsRef.current = next
      return next
    })
  }, [])

  useEffect(() => {
    if (!enabled) {
      aliveLayersRef.current = EMPTY_ALIVE_LAYERS
      rareEventsRef.current = []
      setAliveLayers(EMPTY_ALIVE_LAYERS)
      setMoonHalo(false)
      setFireflyMultiplier(1)
      setSkyEvent(null)
      setRareEvents([])
      return
    }

    let phaseTimer = 0
    let microTimer = 0
    let microEndTimer = 0
    let auroraTimer = 0
    let greatMeteorTimer = 0
    let distantStormTimer = 0
    let impossibleStarTimer = 0
    let owlTimer = 0
    let fogTimer = 0
    let disposed = false

    const emitSkyEvent = (event: Omit<AliveSkyEvent, 'id'>) => {
      eventIdRef.current += 1
      setSkyEvent({ ...event, id: eventIdRef.current })
    }

    const clearRoutineMicroPresentation = () => {
      window.clearTimeout(microEndTimer)
      setSkyEvent(null)
      setMoonHalo(false)
      setFireflyMultiplier(1)
      if (aliveLayersRef.current.fireflies) patchAliveLayers({ fireflies: false })
    }

    const emitRareEvent = (kind: RareEventKind) => {
      const current = rareEventsRef.current

      // Hero sightings own the moment. Subtle rare events wait rather than
      // cluttering Aurora / Great Meteor, while the two hero kinds remain
      // independent so their extremely rare natural overlap is still possible.
      if (isAliveRareMicroKind(kind) && current.some((event) => isAliveRareMicroKind(event.kind) || isAliveHeroKind(event.kind))) {
        return false
      }
      if (isAliveHeroKind(kind) && current.some((event) => event.kind === kind)) {
        return false
      }

      clearRoutineMicroPresentation()
      rareEventIdRef.current += 1
      const event = { kind, id: rareEventIdRef.current }
      const base = isAliveHeroKind(kind)
        ? current.filter((activeEvent) => !isAliveRareMicroKind(activeEvent.kind))
        : current
      const next = [...base, event]
      rareEventsRef.current = next
      setRareEvents(next)
      return true
    }

    const scheduleMicro = (first = false) => {
      window.clearTimeout(microTimer)
      const delay = first ? between(12, 26) * SECOND : between(38, 92) * SECOND
      microTimer = window.setTimeout(runMicroEvent, delay)
    }

    const scheduleDistantStorm = (retry = false) => {
      window.clearTimeout(distantStormTimer)
      const delay = retry ? between(3, 7) * MINUTE : between(20, 45) * MINUTE
      distantStormTimer = window.setTimeout(runDistantStorm, delay)
    }

    const scheduleImpossibleStar = (retry = false) => {
      window.clearTimeout(impossibleStarTimer)
      const delay = retry ? between(3, 7) * MINUTE : between(15, 35) * MINUTE
      impossibleStarTimer = window.setTimeout(runImpossibleStar, delay)
    }

    const scheduleOwl = (retry = false) => {
      window.clearTimeout(owlTimer)
      const delay = retry ? between(5, 11) * MINUTE : between(45, 90) * MINUTE
      owlTimer = window.setTimeout(runOwl, delay)
    }

    const scheduleFogAfterRain = () => {
      window.clearTimeout(fogTimer)
      if (Math.random() >= 0.64 || pitchWorld.wetness < 0.16) return
      fogTimer = window.setTimeout(() => {
        if (disposed) return
        if ((phaseRef.current === 'clearing' || phaseRef.current === 'calm') && pitchWorld.wetness >= 0.10) {
          emitRareEvent('ground-fog')
        }
      }, between(10, 38) * SECOND)
    }

    const applyTimeline = (timeline: AliveTimeline, enteringLive = false) => {
      if (disposed) return
      const previousPhase = phaseRef.current
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
        if (enteringLive && (previousPhase === 'rain' || previousPhase === 'storm')) {
          scheduleFogAfterRain()
        }
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

      // Rare events are a distinct tier above the routine Alive garnish. Let
      // the rare sighting breathe, then try the normal micro stream again.
      if (rareEventsRef.current.length > 0) {
        scheduleMicro()
        return
      }

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
        if (roll < 0.52) {
          emitSkyEvent({ kind: 'moon-veil', duration: between(16_000, 34_000) })
        } else if (roll < 0.90) {
          emitSkyEvent({ kind: 'distant-flash', duration: between(1_100, 1_800) })
        } else {
          // Rare off-screen lightning can expose the same hidden landscape as a
          // strong Storm strike. No badge, no special announcement: it simply happens.
          emitSkyEvent({ kind: 'depth-flash', duration: between(900, 1_350) })
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

    function runDistantStorm() {
      if (disposed) return
      const currentPhase = phaseRef.current
      const compatible = currentPhase === 'calm' || currentPhase === 'clearing' || currentPhase === 'cold-front' || currentPhase === 'snow'
      if (document.visibilityState !== 'visible' || !compatible || !emitRareEvent('distant-storm')) {
        scheduleDistantStorm(true)
        return
      }
      scheduleDistantStorm()
    }

    function runImpossibleStar() {
      if (disposed) return
      const currentPhase = phaseRef.current
      const compatible = currentPhase === 'calm' || currentPhase === 'clearing' || currentPhase === 'cold-front'
      if (document.visibilityState !== 'visible' || !compatible || !emitRareEvent('impossible-star')) {
        scheduleImpossibleStar(true)
        return
      }
      scheduleImpossibleStar()
    }

    function runOwl() {
      if (disposed) return
      const currentPhase = phaseRef.current
      const compatible = currentPhase === 'calm' || currentPhase === 'clearing' || currentPhase === 'cold-front' || currentPhase === 'snow'
      if (document.visibilityState !== 'visible' || !compatible || !emitRareEvent('owl')) {
        scheduleOwl(true)
        return
      }
      scheduleOwl()
    }

    const scheduleHeroTimers = () => {
      window.clearTimeout(auroraTimer)
      window.clearTimeout(greatMeteorTimer)
      const schedule = heroScheduleRef.current
      if (!schedule) return
      auroraTimer = window.setTimeout(() => runHeroEvent('aurora'), Math.max(0, schedule.auroraNextAt - Date.now()))
      greatMeteorTimer = window.setTimeout(() => runHeroEvent('great-meteor'), Math.max(0, schedule.greatMeteorNextAt - Date.now()))
    }

    function runHeroEvent(kind: 'aurora' | 'great-meteor') {
      if (disposed) return
      const schedule = heroScheduleRef.current
      if (!schedule) return
      const now = Date.now()

      // A backgrounded tab does not bank a hero event for later. The world keeps
      // living; if nobody saw that scheduled sighting, it simply becomes a missed one.
      if (document.visibilityState !== 'visible') {
        heroScheduleRef.current = resolveHeroScheduleToNow(schedule, now + 1)
        scheduleHeroTimers()
        return
      }

      // Routine micro-events yield to a hero sighting. Weather itself continues
      // uninterrupted, and the other hero kind is deliberately left alone.
      emitRareEvent(kind)
      const next = kind === 'aurora'
        ? { ...schedule, auroraNextAt: nextAuroraAt(now) }
        : { ...schedule, greatMeteorNextAt: nextGreatMeteorAt(now) }
      heroScheduleRef.current = next
      saveHeroSchedule(next)
      scheduleHeroTimers()
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
    scheduleDistantStorm()
    scheduleImpossibleStar()
    scheduleOwl()

    const savedHeroSchedule = readHeroSchedule()
    const heroSchedule = savedHeroSchedule
      ? resolveHeroScheduleToNow(savedHeroSchedule, now)
      : makeHeroSchedule(now)
    heroScheduleRef.current = heroSchedule
    if (!savedHeroSchedule) saveHeroSchedule(heroSchedule)
    scheduleHeroTimers()

    const syncAfterVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return
      syncTimelineToNow()
      const currentHeroSchedule = heroScheduleRef.current
      if (currentHeroSchedule) {
        heroScheduleRef.current = resolveHeroScheduleToNow(currentHeroSchedule, Date.now())
        scheduleHeroTimers()
      }
    }
    window.addEventListener('pageshow', syncAfterVisibilityChange)
    document.addEventListener('visibilitychange', syncAfterVisibilityChange)

    return () => {
      disposed = true
      window.clearTimeout(phaseTimer)
      window.clearTimeout(microTimer)
      window.clearTimeout(microEndTimer)
      window.clearTimeout(auroraTimer)
      window.clearTimeout(greatMeteorTimer)
      window.clearTimeout(distantStormTimer)
      window.clearTimeout(impossibleStarTimer)
      window.clearTimeout(owlTimer)
      window.clearTimeout(fogTimer)
      window.removeEventListener('pageshow', syncAfterVisibilityChange)
      document.removeEventListener('visibilitychange', syncAfterVisibilityChange)
      aliveLayersRef.current = EMPTY_ALIVE_LAYERS
      rareEventsRef.current = []
      setAliveLayers(EMPTY_ALIVE_LAYERS)
      setMoonHalo(false)
      setFireflyMultiplier(1)
      setSkyEvent(null)
      setRareEvents([])
    }
  }, [enabled, setScene])

  return {
    phase,
    weatherSpeed,
    fireflyMultiplier,
    moonHalo,
    skyEvent,
    aliveLayers,
    rareEvents,
    completeRareEvent,
  }
}
