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

const SECOND = 1_000
const MINUTE = 60_000
const EMPTY_ALIVE_LAYERS: LayerState = { moon: false, storm: false, fireflies: false }
const MOONLIT_ALIVE_LAYERS: LayerState = { moon: true, storm: false, fireflies: false }

function between(min: number, max: number) {
  return min + Math.random() * (max - min)
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

    const schedulePhase = (next: AlivePhase, minMinutes: number, maxMinutes: number) => {
      window.clearTimeout(phaseTimer)
      phaseTimer = window.setTimeout(() => enterPhase(next), between(minMinutes, maxMinutes) * MINUTE)
    }

    const chooseNextFromCalm = () => {
      const roll = Math.random()
      if (roll < 0.42) return 'rain-front' as const
      if (roll < 0.72) return 'cold-front' as const
      return 'calm' as const
    }

    function enterPhase(next: AlivePhase) {
      if (disposed) return
      phaseRef.current = next
      setPhase(next)
      setMoonHalo(false)
      setFireflyMultiplier(1)

      if (next === 'calm') {
        setScene('calm')
        setWeatherSpeed(1)
        patchAliveLayers({ storm: false, fireflies: false })
        schedulePhase(chooseNextFromCalm(), 7, 18)
        return
      }

      if (next === 'rain-front') {
        setScene('calm')
        setWeatherSpeed(1)
        patchAliveLayers({ storm: false, fireflies: false })
        emitSkyEvent({ kind: 'moon-veil', duration: between(18_000, 32_000) })
        schedulePhase('rain', 0.55, 1.15)
        return
      }

      if (next === 'rain') {
        setScene('rain')
        setWeatherSpeed(between(0.78, 1.02))
        patchAliveLayers({ storm: false, fireflies: false })
        schedulePhase(Math.random() < 0.34 ? 'storm' : 'clearing', 8, 18)
        return
      }

      if (next === 'storm') {
        setScene('rain')
        setWeatherSpeed(between(0.98, 1.12))
        patchAliveLayers({ storm: true, fireflies: false })
        schedulePhase('clearing', 6, 13)
        return
      }

      if (next === 'clearing') {
        setScene('calm')
        setWeatherSpeed(1)
        patchAliveLayers({ storm: false, fireflies: false })
        schedulePhase('calm', 3, 7)
        return
      }

      if (next === 'cold-front') {
        setScene('calm')
        setWeatherSpeed(1)
        patchAliveLayers({ storm: false, fireflies: false })
        emitSkyEvent({ kind: 'moon-veil', duration: between(20_000, 38_000) })
        schedulePhase('snow', 0.65, 1.25)
        return
      }

      setScene('snow')
      setWeatherSpeed(between(0.82, 1.02))
      patchAliveLayers({ storm: false, fireflies: false })
      schedulePhase('clearing', 9, 21)
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

    phaseRef.current = 'calm'
    setPhase('calm')
    setWeatherSpeed(1)
    aliveLayersRef.current = MOONLIT_ALIVE_LAYERS
    setAliveLayers(MOONLIT_ALIVE_LAYERS)
    setScene('calm')
    // The first real weather movement is guaranteed early. Alive must prove that it
    // is running before a new user has had time to decide the screen is frozen.
    schedulePhase(Math.random() < 0.56 ? 'rain-front' : 'cold-front', 1.8, 3.0)
    scheduleMicro(true)

    return () => {
      disposed = true
      window.clearTimeout(phaseTimer)
      window.clearTimeout(microTimer)
      window.clearTimeout(microEndTimer)
      aliveLayersRef.current = EMPTY_ALIVE_LAYERS
      setAliveLayers(EMPTY_ALIVE_LAYERS)
      setMoonHalo(false)
      setFireflyMultiplier(1)
      setSkyEvent(null)
    }
  }, [enabled, setScene])

  return { phase, weatherSpeed, fireflyMultiplier, moonHalo, skyEvent, aliveLayers }
}
