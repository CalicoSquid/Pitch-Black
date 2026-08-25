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
  | 'ember'

export type AliveSkyEvent = {
  id: number
  kind: 'shooting-star' | 'distant-flash'
  startX?: number
  startY?: number
  travelX?: number
  travelY?: number
  duration?: number
  direction?: number
}

type UseAliveWorldOptions = {
  enabled: boolean
  scene: Scene
  layers: LayerState
  setScene: Dispatch<SetStateAction<Scene>>
}

const MINUTE = 60_000
const EMPTY_ALIVE_LAYERS: LayerState = { moon: false, storm: false, fireflies: false }

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

export function useAliveWorld({ enabled, scene, layers, setScene }: UseAliveWorldOptions) {
  const [phase, setPhase] = useState<AlivePhase>('calm')
  const [weatherSpeed, setWeatherSpeed] = useState(1)
  const [fireflyMultiplier, setFireflyMultiplier] = useState(1)
  const [moonHalo, setMoonHalo] = useState(false)
  const [skyEvent, setSkyEvent] = useState<AliveSkyEvent | null>(null)
  const [aliveLayers, setAliveLayers] = useState<LayerState>(EMPTY_ALIVE_LAYERS)

  const sceneRef = useRef(scene)
  const userLayersRef = useRef(layers)
  const aliveLayersRef = useRef<LayerState>(EMPTY_ALIVE_LAYERS)
  const phaseRef = useRef<AlivePhase>('calm')
  const eventIdRef = useRef(0)

  useEffect(() => { sceneRef.current = scene }, [scene])
  useEffect(() => { userLayersRef.current = layers }, [layers])

  const patchAliveLayers = (patch: Partial<LayerState>) => {
    setAliveLayers((current) => {
      const next = { ...current, ...patch }
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
    let majorTimer = 0
    let disposed = false

    const scheduleMicro = (first = false) => {
      window.clearTimeout(microTimer)
      microTimer = window.setTimeout(runMicroEvent, between(first ? 3 : 12, first ? 8 : 30) * MINUTE)
    }

    const scheduleMajor = (first = false) => {
      window.clearTimeout(majorTimer)
      majorTimer = window.setTimeout(runMajorEvent, between(first ? 2.2 : 6, first ? 5.2 : 13) * 60 * MINUTE)
    }

    const schedulePhase = (next: AlivePhase, minMinutes: number, maxMinutes: number) => {
      window.clearTimeout(phaseTimer)
      phaseTimer = window.setTimeout(() => enterPhase(next), between(minMinutes, maxMinutes) * MINUTE)
    }

    const chooseCalmAtmosphere = () => {
      const moon = Math.random() < 0.78
      const fireflies = canHostFireflies() && Math.random() < 0.48
      patchAliveLayers({ moon, storm: false, fireflies })
    }

    // Alive owns its own atmospheric state. The user's Moon / Storm / Fireflies
    // toggles remain independent additive overlays and are never rewritten here.
    const chooseOpeningAtmosphere = () => {
      const fireflies = canHostFireflies() && Math.random() < 0.44
      patchAliveLayers({ moon: true, storm: false, fireflies })
    }

    let openingRamp = false

    function enterPhase(next: AlivePhase) {
      if (disposed) return
      phaseRef.current = next
      setPhase(next)
      setMoonHalo(false)
      setFireflyMultiplier(1)

      if (next === 'calm') {
        setScene('calm')
        setWeatherSpeed(1)
        window.clearTimeout(phaseTimer)

        if (openingRamp) {
          openingRamp = false
          chooseOpeningAtmosphere()
          phaseTimer = window.setTimeout(() => enterPhase(chooseFirstFront()), between(8, 20) * MINUTE)
        } else {
          chooseCalmAtmosphere()
          phaseTimer = window.setTimeout(() => enterPhase(chooseNextFromCalm()), between(15, 50) * MINUTE)
        }
        return
      }

      if (next === 'rain-front') {
        setScene('calm')
        setWeatherSpeed(1)
        patchAliveLayers({ moon: false, storm: false, fireflies: false })
        schedulePhase('rain', 2.5, 6)
        return
      }

      if (next === 'rain') {
        setScene('rain')
        setWeatherSpeed(between(0.76, 1.0))
        patchAliveLayers({ moon: false, storm: false, fireflies: false })
        schedulePhase(Math.random() < 0.26 ? 'storm' : 'clearing', 16, 34)
        return
      }

      if (next === 'storm') {
        setScene('rain')
        setWeatherSpeed(between(0.98, 1.12))
        patchAliveLayers({ moon: false, storm: true, fireflies: false })
        schedulePhase('clearing', 9, 19)
        return
      }

      if (next === 'clearing') {
        setScene('calm')
        setWeatherSpeed(1)
        patchAliveLayers({ storm: false, fireflies: false, moon: Math.random() < 0.56 })
        schedulePhase('calm', 4, 10)
        return
      }

      if (next === 'cold-front') {
        setScene('calm')
        setWeatherSpeed(1)
        patchAliveLayers({ moon: false, storm: false, fireflies: false })
        schedulePhase('snow', 3, 7)
        return
      }

      if (next === 'snow') {
        setScene('snow')
        setWeatherSpeed(between(0.82, 1.02))
        patchAliveLayers({ moon: false, storm: false, fireflies: false })
        schedulePhase('clearing', 19, 39)
        return
      }

      setScene('ember')
      setWeatherSpeed(1)
      patchAliveLayers({ storm: false, fireflies: false, moon: Math.random() < 0.44 })
      schedulePhase('calm', 14, 26)
    }

    function chooseFirstFront() {
      return Math.random() < 0.64 ? 'rain-front' as const : 'cold-front' as const
    }

    function chooseNextFromCalm() {
      const roll = Math.random()
      if (roll < 0.45) return 'rain-front' as const
      if (roll < 0.75) return 'cold-front' as const
      return 'calm' as const
    }

    function runMicroEvent() {
      if (disposed) return
      window.clearTimeout(microEndTimer)
      const currentPhase = phaseRef.current

      if (currentPhase === 'calm') {
        const roll = Math.random()
        const moonVisible = userLayersRef.current.moon || aliveLayersRef.current.moon

        if (roll < 0.36 && moonVisible) {
          setMoonHalo(true)
          microEndTimer = window.setTimeout(() => setMoonHalo(false), between(3, 8) * MINUTE)
        } else if (roll < 0.68 && canHostFireflies()) {
          const hadAliveFireflies = aliveLayersRef.current.fireflies
          patchAliveLayers({ fireflies: true })
          setFireflyMultiplier(between(2.45, 2.9))
          microEndTimer = window.setTimeout(() => {
            setFireflyMultiplier(1)
            if (!hadAliveFireflies && phaseRef.current === 'calm') patchAliveLayers({ fireflies: false })
          }, between(3.5, 7.5) * MINUTE)
        } else {
          eventIdRef.current += 1
          const direction = Math.random() < 0.5 ? 1 : -1
          setSkyEvent({
            id: eventIdRef.current,
            kind: 'shooting-star',
            startX: direction > 0 ? between(8, 46) : between(54, 90),
            startY: between(8, 31),
            travelX: direction * between(120, 220),
            travelY: between(42, 86),
            duration: between(900, 1450),
            direction,
          })
        }
      } else if (currentPhase === 'rain-front' || currentPhase === 'clearing' || currentPhase === 'rain') {
        if (Math.random() < 0.42 && currentPhase !== 'rain') {
          eventIdRef.current += 1
          setSkyEvent({ id: eventIdRef.current, kind: 'distant-flash', duration: between(1200, 1900) })
        }
      }

      scheduleMicro()
    }

    function runMajorEvent() {
      if (disposed) return
      const current = phaseRef.current
      if (current === 'calm' || current === 'clearing') {
        enterPhase('ember')
        scheduleMajor(false)
      } else {
        majorTimer = window.setTimeout(runMajorEvent, between(20, 45) * MINUTE)
      }
    }

    let initialPhase: AlivePhase = 'calm'
    if (sceneRef.current === 'rain') initialPhase = 'rain'
    else if (sceneRef.current === 'snow') initialPhase = 'snow'
    else if (sceneRef.current === 'ember') initialPhase = 'ember'

    openingRamp = initialPhase === 'calm'
    enterPhase(initialPhase)
    scheduleMicro(initialPhase === 'calm')
    scheduleMajor(true)

    return () => {
      disposed = true
      window.clearTimeout(phaseTimer)
      window.clearTimeout(microTimer)
      window.clearTimeout(microEndTimer)
      window.clearTimeout(majorTimer)
      aliveLayersRef.current = EMPTY_ALIVE_LAYERS
      setAliveLayers(EMPTY_ALIVE_LAYERS)
      setMoonHalo(false)
      setFireflyMultiplier(1)
      setSkyEvent(null)
    }
  }, [enabled, setScene])

  return { phase, weatherSpeed, fireflyMultiplier, moonHalo, skyEvent, aliveLayers }
}
