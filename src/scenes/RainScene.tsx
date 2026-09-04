import { useEffect, useRef } from 'react'
import { loadPitchAudioAsset } from '../audio/audioAssets'
import { getPitchAudio, getPitchAudioOutput } from '../audio/pitchAudio'
import { usePitchAudioReadyNonce } from '../audio/usePitchAudioReadyNonce'
import { fireflySignal } from '../world/fireflySignal'
import { ambientLanternSignal } from '../world/ambientLifeSignal'
import {
  ensureWorld,
  pitchWorld,
  snowSurfaceYAtIndex,
  stormSignal,
  surfaceYAt,
  worldBaseY,
} from '../world/worldState'

type RainDrop = {
  x: number
  y: number
  length: number
  speed: number
  alpha: number
  width: number
  slantBias: number
  presence: number
}

type Ripple = {
  x: number
  y: number
  age: number
  life: number
  maxRadius: number
  alpha: number
}

type Splash = {
  x: number
  y: number
  age: number
  life: number
  size: number
  alpha: number
  spread: number
  rise: number
  watery: boolean
}

type UmbrellaFrame = {
  active: boolean
  carrierX: number
  carrierSurfaceY: number
  scale: number
  canopyX: number
  canopyCrownY: number
  canopyRadiusX: number
  canopyDrop: number
  alpha: number
  id: number
}

function smoothStep(value: number) {
  const t = Math.max(0, Math.min(1, value))
  return t * t * (3 - 2 * t)
}

export function RainScene({ soundOn, speed, active, alive, audioTest }: { soundOn: boolean; speed: number; active: boolean; alive: boolean; audioTest?: 'steady' | 'heavy' }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const activeRef = useRef(active)
  const aliveRef = useRef(alive)
  const soundOnRef = useRef(soundOn)
  const speedRef = useRef(speed)
  const audioReadyNonce = usePitchAudioReadyNonce()
  const audioRef = useRef<{
    ctx: AudioContext
    steadyGain: GainNode
    heavyGain: GainNode
    steadySource: AudioBufferSourceNode
    heavySource: AudioBufferSourceNode
  } | null>(null)

  useEffect(() => {
    activeRef.current = active
    aliveRef.current = alive
  }, [active, alive])

  useEffect(() => {
    soundOnRef.current = soundOn
  }, [soundOn])

  useEffect(() => {
    speedRef.current = speed
  }, [speed])

  useEffect(() => {
    if (!soundOn) {
      const current = audioRef.current
      if (current) {
        const now = current.ctx.currentTime
        current.steadyGain.gain.setTargetAtTime(0, now, 0.45)
        current.heavyGain.gain.setTargetAtTime(0, now, 0.45)
        window.setTimeout(() => {
          try { current.steadySource.stop() } catch { /* already stopped */ }
          try { current.heavySource.stop() } catch { /* already stopped */ }
          try { current.steadySource.disconnect() } catch { /* harmless */ }
          try { current.heavySource.disconnect() } catch { /* harmless */ }
          try { current.steadyGain.disconnect() } catch { /* harmless */ }
          try { current.heavyGain.disconnect() } catch { /* harmless */ }
          if (audioRef.current === current) audioRef.current = null
        }, 800)
      }
      return
    }

    const audioCtx = getPitchAudio()
    if (!audioCtx) return
    let disposed = false

    const steadyPromise = loadPitchAudioAsset(audioCtx, 'rain-steady-loop.mp3')
    const heavyPromise = loadPitchAudioAsset(audioCtx, 'rain-heavy-loop.mp3')

    void Promise.all([steadyPromise, heavyPromise])
      .then(([steadyBuffer, heavyBuffer]) => {
        if (disposed || audioCtx.state === 'closed') return

        const output = getPitchAudioOutput(audioCtx)
        const steadySource = audioCtx.createBufferSource()
        const heavySource = audioCtx.createBufferSource()
        const steadyGain = audioCtx.createGain()
        const heavyGain = audioCtx.createGain()

        steadySource.buffer = steadyBuffer
        steadySource.loop = true
        steadySource.loopStart = 0
        steadySource.loopEnd = steadyBuffer.duration
        heavySource.buffer = heavyBuffer
        heavySource.loop = true
        heavySource.loopStart = 0
        heavySource.loopEnd = heavyBuffer.duration
        steadyGain.gain.value = 0
        heavyGain.gain.value = 0

        steadySource.connect(steadyGain).connect(output)
        heavySource.connect(heavyGain).connect(output)

        const now = audioCtx.currentTime
        steadySource.start(now, Math.random() * Math.max(0.01, steadyBuffer.duration - 0.01))
        heavySource.start(now, Math.random() * Math.max(0.01, heavyBuffer.duration - 0.01))
        audioRef.current = { ctx: audioCtx, steadyGain, heavyGain, steadySource, heavySource }
      })
      .catch(() => {
        // Real rain is optional audio; visual rain must keep working if loading fails.
      })

    return () => {
      disposed = true
      const current = audioRef.current
      if (!current || current.ctx !== audioCtx) return
      const now = audioCtx.currentTime
      current.steadyGain.gain.setTargetAtTime(0, now, 0.32)
      current.heavyGain.gain.setTargetAtTime(0, now, 0.32)
      window.setTimeout(() => {
        try { current.steadySource.stop() } catch { /* already stopped */ }
        try { current.heavySource.stop() } catch { /* already stopped */ }
        try { current.steadySource.disconnect() } catch { /* harmless */ }
        try { current.heavySource.disconnect() } catch { /* harmless */ }
        try { current.steadyGain.disconnect() } catch { /* harmless */ }
        try { current.heavyGain.disconnect() } catch { /* harmless */ }
      }, 650)
      audioRef.current = null
    }
  }, [soundOn, audioReadyNonce])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let raf = 0
    let idleTimer = 0
    let frame = 0
    let width = window.innerWidth
    let height = window.innerHeight
    let dpr = Math.min(window.devicePixelRatio || 1, 1.5)
    let drops: RainDrop[] = []
    let ripples: Ripple[] = []
    let splashes: Splash[] = []
    let driftSnapshot = new Float32Array(pitchWorld.drifts.length)
    let waterSnapshot = new Float32Array(pitchWorld.water.length)
    let idleCleared = false
    let lastSteadyGainNode: GainNode | null = null
    let lastHeavyGainNode: GainNode | null = null
    let lastSteadyTargetGain = Number.NaN
    let lastHeavyTargetGain = Number.NaN
    let intensity = audioTest === 'heavy' ? 0.98 : audioTest === 'steady' ? 0.50 : 0.72
    let targetIntensity = intensity
    let nextWeatherShift = performance.now() + 12000
    let curtainStart = performance.now() + 2200 + Math.random() * 3200
    let curtainDuration = 28000 + Math.random() * 17000
    let curtainDirection = Math.random() < 0.5 ? -1 : 1
    let curtainHalfWidth = 0.32 + Math.random() * 0.12
    let curtainStrength = 0.10 + Math.random() * 0.09
    let gustStart = performance.now() + 9000 + Math.random() * 12000
    let gustDuration = 3000 + Math.random() * 5000
    let gustDirection = Math.random() < 0.5 ? -1 : 1
    let gustStrength = 0.18 + Math.random() * 0.20
    const umbrellaFrame: UmbrellaFrame = {
      active: false,
      carrierX: 0,
      carrierSurfaceY: 0,
      scale: 1,
      canopyX: 0,
      canopyCrownY: 0,
      canopyRadiusX: 1,
      canopyDrop: 0,
      alpha: 0,
      id: 0,
    }

    const waterline = () => worldBaseY(height)

    const makeDrop = (randomY = false): RainDrop => {
      const depth = Math.random()
      return {
        x: Math.random() * width,
        y: randomY ? Math.random() * waterline() : -20 - Math.random() * 120,
        length: 4.5 + depth * 10,
        speed: 3.2 + depth * 5.3,
        alpha: 0.16 + depth * 0.30,
        width: 0.55 + depth * 0.42,
        slantBias: (Math.random() * 2 - 1) * 0.012,
        presence: Math.random(),
      }
    }

    const resize = () => {
      width = window.innerWidth
      height = window.innerHeight
      dpr = Math.min(window.devicePixelRatio || 1, 1.5)
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ensureWorld(width, height)
      if (driftSnapshot.length !== pitchWorld.drifts.length) driftSnapshot = new Float32Array(pitchWorld.drifts.length)
      if (waterSnapshot.length !== pitchWorld.water.length) waterSnapshot = new Float32Array(pitchWorld.water.length)

      const count = Math.min(150, Math.max(55, Math.floor((width * height) / 12500)))
      drops = Array.from({ length: count }, () => makeDrop(true))
      ripples = []
      splashes = []
    }

    const impact = (drop: RainDrop) => {
      const idx = Math.max(1, Math.min(pitchWorld.drifts.length - 2, Math.floor((drop.x / width) * (pitchWorld.drifts.length - 1))))
      const snowDepth = pitchWorld.drifts[idx]
      const frozenAtImpact = Math.max(0, Math.min(1, pitchWorld.ice[idx] || 0))
      const y = surfaceYAt(drop.x, width, height)

      if (frozenAtImpact > 0.015) {
        const localThaw = Math.min(frozenAtImpact, 0.012 + drop.speed * 0.0016)
        pitchWorld.ice[idx] = Math.max(0, pitchWorld.ice[idx] - localThaw)
        pitchWorld.ice[idx - 1] = Math.max(0, pitchWorld.ice[idx - 1] - localThaw * 0.28)
        pitchWorld.ice[idx + 1] = Math.max(0, pitchWorld.ice[idx + 1] - localThaw * 0.28)
      }

      if (snowDepth > 1.2) {
        const melt = (0.415 + drop.speed * 0.0317) * Math.max(1, speedRef.current * 0.78)
        pitchWorld.drifts[idx] = Math.max(0, pitchWorld.drifts[idx] - melt)
        pitchWorld.drifts[idx - 1] = Math.max(0, pitchWorld.drifts[idx - 1] - melt * 0.38)
        pitchWorld.drifts[idx + 1] = Math.max(0, pitchWorld.drifts[idx + 1] - melt * 0.38)
        pitchWorld.wetness = Math.min(1, pitchWorld.wetness + 0.0035)
      }
      const remainingSnow = pitchWorld.drifts[idx]
      if (remainingSnow < 7) {
        const collection = (0.055 + drop.speed * 0.006) * Math.max(1, speedRef.current * 0.45)
        pitchWorld.water[idx] = Math.min(9, pitchWorld.water[idx] + collection)
        pitchWorld.water[idx - 1] = Math.min(9, pitchWorld.water[idx - 1] + collection * 0.32)
        pitchWorld.water[idx + 1] = Math.min(9, pitchWorld.water[idx + 1] + collection * 0.32)
        pitchWorld.waterLevel = Math.min(1.08, pitchWorld.waterLevel + collection * 0.0018)
      }

      const pooled = Math.min(1, pitchWorld.water[idx] / 2.4)
      const exposedGround = Math.max(0, 1 - remainingSnow / 7)
      const frozenNow = Math.max(0, Math.min(1, pitchWorld.ice[idx] || 0))
      const liquidResponse = Math.max(0.10, 1 - frozenNow * 0.90)
      const watery = Math.min(1, (0.05 + pooled * 0.82 + exposedGround * 0.42) * liquidResponse)
      const rippleChance = (0.08 + watery * 0.84) * (0.18 + liquidResponse * 0.82)
      if (Math.random() < rippleChance) {
        ripples.push({
          x: drop.x,
          y: Math.min(height - 1, y + Math.min(1.3, remainingSnow * 0.035)),
          age: 0,
          life: 980 + Math.random() * 620,
          maxRadius: 10 + watery * 10 + Math.random() * (8 + watery * 8),
          alpha: 0.07 + watery * 0.14 + Math.random() * 0.04,
        })
      }

      if (Math.random() < (0.30 + watery * 0.48) * (0.42 + liquidResponse * 0.58)) {
        splashes.push({
          x: drop.x,
          y,
          age: 0,
          life: watery > 0.34 ? 270 + Math.random() * 160 : 210 + Math.random() * 120,
          size: watery > 0.34 ? 2.1 + Math.random() * 3.3 : 1.2 + Math.random() * 1.9,
          alpha: watery > 0.34 ? 0.15 + Math.random() * 0.1 : 0.08 + Math.random() * 0.06,
          spread: watery > 0.34 ? 0.9 + Math.random() * 0.8 : 0.45 + Math.random() * 0.45,
          rise: watery > 0.34 ? 1.45 + Math.random() * 0.6 : 0.75 + Math.random() * 0.35,
          watery: watery > 0.34,
        })
      }
    }

    const updateUmbrellaFrame = () => {
      const active = ambientLanternSignal.active && ambientLanternSignal.alpha > 0.02
      umbrellaFrame.active = active
      if (!active) return umbrellaFrame

      const carrierX = ambientLanternSignal.x
      const carrierSurfaceY = surfaceYAt(carrierX, width, height)
      const scale = ambientLanternSignal.scale * Math.max(0.92, Math.min(1.08, width / 1200))
      umbrellaFrame.carrierX = carrierX
      umbrellaFrame.carrierSurfaceY = carrierSurfaceY
      umbrellaFrame.scale = scale
      umbrellaFrame.canopyX = carrierX - ambientLanternSignal.direction * 1.0 * scale
      umbrellaFrame.canopyCrownY = carrierSurfaceY - 34.5 * scale
      umbrellaFrame.canopyRadiusX = 22.5 * scale
      umbrellaFrame.canopyDrop = 6.2 * scale
      umbrellaFrame.alpha = ambientLanternSignal.alpha
      umbrellaFrame.id = ambientLanternSignal.id
      return umbrellaFrame
    }

    const canopyYAt = (umbrella: UmbrellaFrame, x: number) => {
      const nx = (x - umbrella.canopyX) / Math.max(1, umbrella.canopyRadiusX)
      if (Math.abs(nx) > 1) return Number.POSITIVE_INFINITY
      return umbrella.canopyCrownY + umbrella.canopyDrop * (1 - Math.sqrt(Math.max(0, 1 - nx * nx)))
    }

    const drawDrop = (
      drop: RainDrop,
      curtainLift: number,
      ambientGust: number,
      stormWind: number,
      umbrella: UmbrellaFrame,
    ) => {
      const slant = drop.length * (0.08 + drop.slantBias + ambientGust * 0.04 + stormWind * 0.10)
      const rainAlpha = Math.min(0.56, drop.alpha * (0.72 + intensity * 0.38) * curtainLift)
      const ax = drop.x
      const ay = drop.y
      const bx = drop.x - slant
      const by = drop.y + drop.length

      // The walker carries an invisible umbrella in rain. Geometry is resolved
      // once per frame, then reused for every drop so the locked visual costs no
      // repeated terrain lookup / closure allocation in the particle hot loop.
      if (umbrella.active) {
        const canopyX = umbrella.canopyX
        const canopyRadiusX = umbrella.canopyRadiusX

        const midX = (ax + bx) * 0.5
        const midY = (ay + by) * 0.5
        const midCanopyY = canopyYAt(umbrella, midX)
        if (
          Number.isFinite(midCanopyY) &&
          midY > midCanopyY + 0.8 &&
          midY < umbrella.carrierSurfaceY + 1 &&
          Math.abs(midX - canopyX) < canopyRadiusX * 0.78
        ) return

        let hitT = -1
        let hitX = 0
        let hitY = 0
        const samples = 12
        for (let i = 0; i <= samples; i += 1) {
          const t = i / samples
          const x = ax + (bx - ax) * t
          const y = ay + (by - ay) * t
          const canopyY = canopyYAt(umbrella, x)
          if (Number.isFinite(canopyY) && y >= canopyY - 0.6 && y <= canopyY + 2.6) {
            hitT = t
            hitX = x
            hitY = canopyY
            break
          }
        }

        if (hitT >= 0) {
          if (hitT > 0.04) {
            ctx.beginPath()
            ctx.moveTo(ax, ay)
            ctx.lineTo(hitX, hitY)
            ctx.strokeStyle = `rgba(196, 213, 226, ${rainAlpha})`
            ctx.lineWidth = drop.width
            ctx.stroke()
          }

          const side = hitX >= canopyX ? 1 : -1
          const edgeBias = Math.min(1, Math.abs(hitX - canopyX) / Math.max(1, canopyRadiusX))
          ctx.beginPath()
          ctx.moveTo(hitX, hitY)
          ctx.lineTo(
            hitX + side * (4.6 + edgeBias * 3.4 + drop.width * 1.4),
            hitY + 2.0 + drop.width * 1.4,
          )
          ctx.strokeStyle = `rgba(196, 213, 226, ${rainAlpha * 0.72})`
          ctx.lineWidth = Math.max(0.44, drop.width * 0.76)
          ctx.stroke()
          return
        }
      }

      ctx.beginPath()
      ctx.moveTo(ax, ay)
      ctx.lineTo(bx, by)
      ctx.strokeStyle = `rgba(196, 213, 226, ${rainAlpha})`
      ctx.lineWidth = drop.width
      ctx.stroke()
    }



    const drawUmbrellaRunoff = (time: number, rainDensity: number, umbrella: UmbrellaFrame) => {
      if (!umbrella.active) return

      const scale = umbrella.scale
      const canopyX = umbrella.canopyX
      const radiusX = umbrella.canopyRadiusX
      const edgeNorm = 0.93
      const edgeY = umbrella.canopyCrownY + umbrella.canopyDrop * (1 - Math.sqrt(Math.max(0, 1 - edgeNorm * edgeNorm)))
      const baseAlpha = umbrella.alpha * (0.12 + rainDensity * 0.16)

      for (const side of [-1, 1]) {
        const seed = umbrella.id * 0.37 + side * 1.9
        const speed = 0.72 + (Math.sin(seed * 4.3) * 0.5 + 0.5) * 0.44
        const phase = ((time * 0.001 * speed + seed * 0.83) % 1 + 1) % 1
        if (phase > 0.72) continue

        const fall = phase / 0.72
        const edgeX = canopyX + side * radiusX * edgeNorm
        const x = edgeX + side * fall * 3.1 * scale
        const y = edgeY + fall * 10.5 * scale
        const alpha = baseAlpha * Math.sin(fall * Math.PI)
        if (alpha <= 0.006) continue

        ctx.beginPath()
        ctx.moveTo(x, y)
        ctx.lineTo(x + side * 0.7 * scale, y + (2.2 + fall * 1.8) * scale)
        ctx.strokeStyle = `rgba(196, 213, 226, ${alpha})`
        ctx.lineWidth = 0.48
        ctx.lineCap = 'round'
        ctx.stroke()
      }
    }

    const curtainLiftAt = (x: number, time: number) => {
      if (time < curtainStart) return 1

      let progress = (time - curtainStart) / curtainDuration
      if (progress >= 1) {
        curtainStart = time + 2800 + Math.random() * 5200
        curtainDuration = 28000 + Math.random() * 17000
        curtainDirection = Math.random() < 0.5 ? -1 : 1
        curtainHalfWidth = 0.32 + Math.random() * 0.12
        curtainStrength = 0.10 + Math.random() * 0.09
        return 1
      }

      progress = Math.max(0, Math.min(1, progress))
      const margin = curtainHalfWidth + 0.12
      const travel = 1 + margin * 2
      const center = curtainDirection > 0
        ? -margin + progress * travel
        : 1 + margin - progress * travel
      const distance = Math.abs(x / Math.max(1, width) - center)
      if (distance >= curtainHalfWidth) return 1

      const normalized = 1 - distance / curtainHalfWidth
      const smooth = normalized * normalized * (3 - 2 * normalized)
      return 1 + curtainStrength * smooth
    }


    const ambientGustAt = (time: number) => {
      if (time < gustStart) return 0

      const progress = (time - gustStart) / gustDuration
      if (progress >= 1) {
        gustStart = time + 12000 + Math.random() * 18000
        gustDuration = 3000 + Math.random() * 5000
        gustDirection = Math.random() < 0.5 ? -1 : 1
        gustStrength = 0.18 + Math.random() * 0.20
        return 0
      }

      const envelope = Math.sin(Math.max(0, Math.min(1, progress)) * Math.PI)
      const stormSuppression = Math.max(0, 1 - stormSignal.mix)
      return gustDirection * gustStrength * envelope * envelope * stormSuppression
    }

    const tryExtinguishFirefly = (drop: RainDrop, weatherMix: number, ambientGust: number) => {
      if (!activeRef.current || weatherMix < 0.42 || fireflySignal.count === 0) return

      const stormWind = stormSignal.wind * stormSignal.mix
      const ax = drop.x
      const ay = drop.y
      const bx = drop.x - drop.length * (0.08 + drop.slantBias + ambientGust * 0.04 + stormWind * 0.10)
      const by = drop.y + drop.length
      const abx = bx - ax
      const aby = by - ay
      const abLengthSq = abx * abx + aby * aby
      const hitRadiusSq = 2.35 * 2.35

      for (let i = 0; i < fireflySignal.count; i++) {
        if (fireflySignal.extinguishRequests[i] !== 0) continue

        const offset = i * 2
        const px = fireflySignal.positions[offset]
        const py = fireflySignal.positions[offset + 1]
        const apx = px - ax
        const apy = py - ay
        const projection = abLengthSq > 0 ? (apx * abx + apy * aby) / abLengthSq : 0
        const t = Math.max(0, Math.min(1, projection))
        const closestX = ax + abx * t
        const closestY = ay + aby * t
        const dx = px - closestX
        const dy = py - closestY

        if (dx * dx + dy * dy <= hitRadiusSq && Math.random() < 0.036 * intensity * weatherMix) {
          fireflySignal.extinguishRequests[i] = fireflySignal.ids[i]
          return
        }
      }
    }

    const updateWeather = (time: number) => {
      if (!audioTest && time > nextWeatherShift) {
        targetIntensity = 0.46 + Math.random() * 0.52
        nextWeatherShift = time + 9000 + Math.random() * 18000
      }
      intensity += (targetIntensity - intensity) * 0.0016
    }

    let lastTime = performance.now()
    let simTime = performance.now()
    let weatherMix = activeRef.current && !aliveRef.current ? 1 : 0
    let wasActive = activeRef.current
    let aliveRiseTau = 8_000
    let aliveFallTau = 36_000 + Math.random() * 10_000
    let audioWeatherMix = weatherMix
    let aliveArrival: 'sudden' | 'gradual' = 'gradual'
    let materialCarry = 0
    let materialFrame = 0
    const draw = (time: number) => {
      frame += 1
      const dt = Math.min(32, time - lastTime)
      lastTime = time
      const speedNow = speedRef.current
      simTime += dt * speedNow

      const nowActive = activeRef.current
      if (nowActive && !wasActive && aliveRef.current) {
        // Rain gets two believable entrances in Alive: a front can build in, or
        // a downpour can simply arrive. Both always leave with a long soft taper.
        aliveArrival = Math.random() < 0.42 ? 'sudden' : 'gradual'
        aliveRiseTau = aliveArrival === 'sudden'
          ? 1_200 + Math.random() * 1_000
          : 9_000 + Math.random() * 7_000
        aliveFallTau = 34_000 + Math.random() * 12_000
        if (aliveArrival === 'gradual') {
          for (let i = 0; i < drops.length; i++) {
            drops[i].y = -20 - Math.random() * 150
          }
        }
      }
      wasActive = nowActive

      const targetMix = nowActive ? 1 : 0
      const transitionTau = aliveRef.current
        ? (nowActive ? aliveRiseTau : aliveFallTau)
        : 520
      const blend = 1 - Math.exp(-dt / transitionTau)
      weatherMix += (targetMix - weatherMix) * blend

      const rainDensity = aliveRef.current
        ? (aliveArrival === 'gradual' && nowActive
          ? Math.pow(Math.max(0, weatherMix), 1.85)
          : Math.pow(Math.max(0, weatherMix), 1.20))
        : weatherMix
      const visualAlpha = aliveRef.current
        ? (nowActive ? 0.60 + weatherMix * 0.40 : Math.sqrt(Math.max(0, weatherMix)))
        : weatherMix

      // Rain can arrive quickly, but the sound should almost always recede into
      // distance rather than being switched off with the particle population.
      const audioTarget = nowActive ? 1 : 0
      const audioTau = aliveRef.current
        ? (nowActive ? Math.max(1_000, aliveRiseTau * 0.78) : 48_000)
        : 520
      const audioBlend = 1 - Math.exp(-dt / audioTau)
      audioWeatherMix += (audioTarget - audioWeatherMix) * audioBlend
      const audioDensity = aliveRef.current
        ? (nowActive ? Math.max(rainDensity, audioWeatherMix * 0.62) : Math.pow(Math.max(0, audioWeatherMix), 0.84))
        : weatherMix

      const currentAudio = audioRef.current
      if (currentAudio) {
        // The steady field recording establishes the rain bed. The heavier recording
        // only blooms when the procedural storm density/intensity actually rises,
        // so the audio follows the same living weather rather than switching clips.
        const heavyPresence = smoothStep((intensity - 0.58) / 0.34)
        const steadyTarget = soundOnRef.current ? 0.34 * audioDensity : 0
        const heavyTarget = soundOnRef.current ? 0.46 * audioDensity * heavyPresence : 0

        if (currentAudio.steadyGain !== lastSteadyGainNode) {
          lastSteadyGainNode = currentAudio.steadyGain
          lastSteadyTargetGain = Number.NaN
        }
        if (currentAudio.heavyGain !== lastHeavyGainNode) {
          lastHeavyGainNode = currentAudio.heavyGain
          lastHeavyTargetGain = Number.NaN
        }
        if (Math.abs(steadyTarget - lastSteadyTargetGain) > 0.0005 || Number.isNaN(lastSteadyTargetGain)) {
          currentAudio.steadyGain.gain.setTargetAtTime(steadyTarget, currentAudio.ctx.currentTime, 0.85)
          lastSteadyTargetGain = steadyTarget
        }
        if (Math.abs(heavyTarget - lastHeavyTargetGain) > 0.0005 || Number.isNaN(lastHeavyTargetGain)) {
          currentAudio.heavyGain.gain.setTargetAtTime(heavyTarget, currentAudio.ctx.currentTime, 1.15)
          lastHeavyTargetGain = heavyTarget
        }
      } else {
        lastSteadyGainNode = null
        lastHeavyGainNode = null
        lastSteadyTargetGain = Number.NaN
        lastHeavyTargetGain = Number.NaN
      }

      if (weatherMix < 0.004 && !activeRef.current) {
        if (!idleCleared) {
          ctx.clearRect(0, 0, width, height)
          idleCleared = true
        }
        idleTimer = window.setTimeout(() => {
          raf = requestAnimationFrame(draw)
        }, 200)
        return
      }

      idleCleared = false
      ctx.clearRect(0, 0, width, height)
      ctx.globalAlpha = visualAlpha
      updateWeather(simTime)

      // Material evolution does not need particle-frame cadence. Running the
      // small terrain/ice grid at ~30 Hz preserves its real-time rates while
      // avoiding duplicate whole-world passes on high-refresh displays.
      materialCarry += dt
      if (materialCarry >= 32 && pitchWorld.drifts.length > 2) {
        const materialDt = Math.min(66, materialCarry)
        materialCarry = 0
        materialFrame += 1
        const scaledDt = (materialDt / 16.67) * speedNow
        const meltRate = (0.00390 + intensity * 0.00634) * scaledDt * rainDensity
        driftSnapshot.set(pitchWorld.drifts)
        const copy = driftSnapshot

        for (let i = 1; i < pitchWorld.drifts.length - 1; i++) {
          const channelNoise = 0.72 + ((Math.sin(i * 1.73 + simTime * 0.00017) + 1) * 0.34)
          const exposure = 0.75 + Math.max(0, copy[i] - (copy[i - 1] + copy[i + 1]) * 0.5) * 0.045
          pitchWorld.drifts[i] = Math.max(0, pitchWorld.drifts[i] - meltRate * channelNoise * exposure)

          if (materialFrame % 2 === 0) {
            const target = pitchWorld.drifts[i - 1] < pitchWorld.drifts[i + 1] ? i - 1 : i + 1
            const slope = pitchWorld.drifts[i] - pitchWorld.drifts[target]
            if (slope > 3.2) {
              const slump = Math.min(0.045 * speedNow, (slope - 3.2) * 0.012 * speedNow)
              pitchWorld.drifts[i] = Math.max(0, pitchWorld.drifts[i] - slump)
              pitchWorld.drifts[target] += slump * 0.42
            }
          }
        }
        pitchWorld.wetness = Math.min(1, pitchWorld.wetness + 0.00042 * scaledDt * rainDensity)
        // A prolonged rain builds a visible shared water table across the low
        // ground. This is intentionally simple and scene-readable rather than
        // a literal fluid simulation.
        pitchWorld.waterLevel = Math.min(1.08, pitchWorld.waterLevel + (0.00024 + intensity * 0.00024) * scaledDt * rainDensity)

        // Rain reverses the cold skin gradually rather than toggling it off.
        // Heavy rain clears it in roughly half a minute; a thin arriving front
        // takes longer, so the first drops can visibly strike a hard surface.
        if (pitchWorld.ice.length === pitchWorld.drifts.length) {
          const thawRate = (0.00020 + intensity * 0.00034) * scaledDt * rainDensity
          for (let i = 1; i < pitchWorld.ice.length - 1; i++) {
            if (pitchWorld.ice[i] > 0.001) {
              const exposed = Math.max(0.35, 1 - pitchWorld.drifts[i] / 18)
              pitchWorld.ice[i] = Math.max(0, pitchWorld.ice[i] - thawRate * exposed)
            }
          }
        }
      }

      if (frame % 8 === 0 && pitchWorld.water.length > 2) {
        waterSnapshot.set(pitchWorld.water)
        const snapshot = waterSnapshot
        for (let i = 1; i < pitchWorld.water.length - 1; i++) {
          if (snapshot[i] < 0.08) continue
          const leftY = snowSurfaceYAtIndex(i - 1, height)
          const rightY = snowSurfaceYAtIndex(i + 1, height)
          const target = leftY >= rightY ? i - 1 : i + 1
          const currentY = snowSurfaceYAtIndex(i, height)
          const targetY = snowSurfaceYAtIndex(target, height)
          if (targetY >= currentY - 1.2) {
            const flow = Math.min(snapshot[i] * 0.035 * speedNow, 0.045)
            pitchWorld.water[i] = Math.max(0, pitchWorld.water[i] - flow)
            pitchWorld.water[target] = Math.min(9, pitchWorld.water[target] + flow * 0.92)
          }
        }
      }

      const stormWind = stormSignal.wind * stormSignal.mix
      const ambientGust = ambientGustAt(time)
      const frameScale = dt / 16.67
      const fallScale = frameScale * (0.78 + intensity * 0.42) * Math.max(0.7, Math.sqrt(speedNow))
      const driftScale = (stormWind * 0.34 + ambientGust * 0.08) * frameScale
      const umbrella = updateUmbrellaFrame()
      ctx.lineCap = 'round'
      for (let i = 0; i < drops.length; i++) {
        const drop = drops[i]
        const participating = drop.presence <= rainDensity
        drop.y += drop.speed * fallScale
        drop.x += driftScale

        if (drop.x < -30) drop.x = width + 20
        if (drop.x > width + 30) drop.x = -20

        // Firefly collision is stochastic and tiny; checking one third of the
        // drops per frame keeps the same visual behaviour without an N×M scan
        // across every raindrop/firefly pair on every refresh.
        if (participating && (frame + i) % 3 === 0) tryExtinguishFirefly(drop, rainDensity, ambientGust)

        const surface = surfaceYAt(drop.x, width, height)
        if (drop.y + drop.length >= surface) {
          const shelteredAtGround = umbrella.active
            && Math.abs(drop.x - umbrella.carrierX) < 16.5 * umbrella.scale
          if (!shelteredAtGround && participating && Math.random() < intensity * rainDensity * 0.96) impact(drop)
          drops[i] = makeDrop(false)
          continue
        }

        if (participating) drawDrop(drop, curtainLiftAt(drop.x, time), ambientGust, stormWind, umbrella)
      }

      drawUmbrellaRunoff(time, rainDensity, umbrella)

      let rippleWrite = 0
      for (let rippleRead = 0; rippleRead < ripples.length; rippleRead++) {
        const ripple = ripples[rippleRead]
        ripple.age += dt
        const progress = ripple.age / ripple.life
        if (progress >= 1) continue

        const radius = ripple.maxRadius * Math.pow(progress, 0.72)
        const fade = Math.sin(progress * Math.PI) * (1 - progress * 0.35)
        ctx.beginPath()
        ctx.ellipse(ripple.x, ripple.y, radius, radius * 0.2, 0, 0, Math.PI * 2)
        ctx.strokeStyle = `rgba(194, 211, 223, ${ripple.alpha * fade})`
        ctx.lineWidth = 0.65
        ctx.stroke()

        if (progress > 0.12 && progress < 0.82) {
          ctx.beginPath()
          ctx.ellipse(ripple.x, ripple.y, radius * 0.56, radius * 0.11, 0, 0, Math.PI * 2)
          ctx.strokeStyle = `rgba(176, 197, 211, ${ripple.alpha * fade * 0.52})`
          ctx.lineWidth = 0.45
          ctx.stroke()
        }
        ripples[rippleWrite++] = ripple
      }
      ripples.length = rippleWrite

      let splashWrite = 0
      for (let splashRead = 0; splashRead < splashes.length; splashRead++) {
        const splash = splashes[splashRead]
        splash.age += dt
        const progress = splash.age / splash.life
        if (progress >= 1) continue

        const fade = 1 - progress
        const pulse = Math.sin(Math.min(1, progress * 1.2) * Math.PI)
        if (progress < 0.22) {
          ctx.beginPath()
          ctx.arc(splash.x, splash.y, 0.55 + splash.size * 0.09, 0, Math.PI * 2)
          ctx.fillStyle = splash.watery
            ? `rgba(221, 231, 238, ${splash.alpha * fade * 0.95})`
            : `rgba(204, 217, 226, ${splash.alpha * fade * 0.7})`
          ctx.fill()
        }

        const arms = splash.watery ? 3 : 2
        for (let arm = 0; arm < arms; arm++) {
          const centered = arms === 3 ? arm - 1 : arm - 0.5
          const offset = centered * splash.size * splash.spread
          const rise = pulse * splash.size * splash.rise * (splash.watery ? 1.25 + arm * 0.12 : 0.9 + arm * 0.08)
          ctx.beginPath()
          ctx.moveTo(splash.x, splash.y)
          ctx.quadraticCurveTo(
            splash.x + offset * 0.42,
            splash.y - rise,
            splash.x + offset,
            splash.y - rise * (splash.watery ? 0.72 : 0.58)
          )
          ctx.strokeStyle = splash.watery
            ? `rgba(208, 221, 231, ${splash.alpha * fade})`
            : `rgba(194, 209, 220, ${splash.alpha * fade * 0.72})`
          ctx.lineWidth = splash.watery ? 0.55 : 0.38
          ctx.stroke()
        }
        splashes[splashWrite++] = splash
      }
      splashes.length = splashWrite

      ctx.globalAlpha = 1
      raf = requestAnimationFrame(draw)
    }

    const syncRainVisibility = () => {
      // RAF weather envelopes deliberately decay slowly while the page is visible,
      // but they must not preserve an old rain tail across minutes spent in another
      // tab. If Alive has moved on while hidden, return immediately to the real state.
      if (document.visibilityState === 'visible' && !activeRef.current) {
        weatherMix = 0
        audioWeatherMix = 0
        ripples.length = 0
        splashes.length = 0
        ctx.clearRect(0, 0, width, height)
        idleCleared = true
      }

      const currentAudio = audioRef.current
      if (currentAudio && (document.visibilityState !== 'visible' || !activeRef.current)) {
        const now = currentAudio.ctx.currentTime
        currentAudio.steadyGain.gain.cancelScheduledValues(now)
        currentAudio.heavyGain.gain.cancelScheduledValues(now)
        currentAudio.steadyGain.gain.setValueAtTime(0, now)
        currentAudio.heavyGain.gain.setValueAtTime(0, now)
        lastSteadyTargetGain = 0
        lastHeavyTargetGain = 0
      }
    }

    resize()
    window.addEventListener('resize', resize)
    document.addEventListener('visibilitychange', syncRainVisibility)
    window.addEventListener('pageshow', syncRainVisibility)
    raf = requestAnimationFrame(draw)

    return () => {
      cancelAnimationFrame(raf)
      window.clearTimeout(idleTimer)
      window.removeEventListener('resize', resize)
      document.removeEventListener('visibilitychange', syncRainVisibility)
      window.removeEventListener('pageshow', syncRainVisibility)
    }
  }, [])

  return <canvas className="scene-canvas" ref={canvasRef} aria-hidden="true" />
}



