import { useEffect, useRef } from 'react'
import { getPitchAudio, getPitchAudioOutput } from '../audio/pitchAudio'
import { fireflySignal } from '../world/fireflySignal'
import { lightningGroundStrikeSignal } from '../world/lightningSignal'
import { ensureWorld, pitchWorld, snowSurfaceYAtIndex, stormSignal } from '../world/worldState'

type Flake = {
  x: number
  y: number
  size: number
  vy: number
  vx: number
  drift: number
  phase: number
  alpha: number
  depth: number
  rotation: number
  spin: number
  seed: number
  arms: number
  branch: number
  presence: number
}

type WindState = {
  value: number
  target: number
  phase: 'calm' | 'building' | 'gusting' | 'settling'
  nextChange: number
}

type LoosePowder = {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  maxLife: number
  alpha: number
  size: number
  phase: number
  swirl: number
}


export function SnowScene({ soundOn, speed, active, alive }: { soundOn: boolean; speed: number; active: boolean; alive: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const activeRef = useRef(active)
  const aliveRef = useRef(alive)
  const soundOnRef = useRef(soundOn)
  const audioRef = useRef<{ ctx: AudioContext; gain: GainNode; source: AudioBufferSourceNode } | null>(null)

  useEffect(() => {
    activeRef.current = active
    aliveRef.current = alive
  }, [active, alive])

  useEffect(() => {
    soundOnRef.current = soundOn
  }, [soundOn])

  useEffect(() => {
    if (!soundOn) {
      if (audioRef.current) {
        const current = audioRef.current
        current.gain.gain.setTargetAtTime(0, current.ctx.currentTime, 0.6)
        window.setTimeout(() => {
          try { current.source.stop() } catch { /* already stopped */ }
          if (audioRef.current === current) audioRef.current = null
        }, 900)
      }
      return
    }

    const audioCtx = getPitchAudio()
    if (!audioCtx) return
    const seconds = 3
    const buffer = audioCtx.createBuffer(1, audioCtx.sampleRate * seconds, audioCtx.sampleRate)
    const data = buffer.getChannelData(0)
    let last = 0
    for (let i = 0; i < data.length; i++) {
      const white = Math.random() * 2 - 1
      last = last * 0.985 + white * 0.015
      data[i] = last * 0.7
    }

    const source = audioCtx.createBufferSource()
    source.buffer = buffer
    source.loop = true
    const filter = audioCtx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = 480
    const gain = audioCtx.createGain()
    gain.gain.value = 0
    source.connect(filter).connect(gain).connect(getPitchAudioOutput(audioCtx))
    source.start()
    gain.gain.setTargetAtTime(0.035, audioCtx.currentTime, 1.2)
    audioRef.current = { ctx: audioCtx, gain, source }

    return () => {
      gain.gain.setTargetAtTime(0, audioCtx.currentTime, 0.3)
      window.setTimeout(() => {
        try { source.stop() } catch { /* already stopped */ }
      }, 500)
      audioRef.current = null
    }
  }, [soundOn])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let frame = 0
    let raf = 0
    let width = window.innerWidth
    let height = window.innerHeight
    let dpr = Math.min(window.devicePixelRatio || 1, 1.5)
    let flakes: Flake[] = []
    let loosePowder: LoosePowder[] = []
    let lastLightningVersion = lightningGroundStrikeSignal.version
    let drifts = pitchWorld.drifts
    let driftSnapshot = new Float32Array(drifts.length)
    let idleCleared = false
    let lastAudioGainNode: GainNode | null = null
    let lastAudioTargetGain = Number.NaN
    let wind: WindState = {
      value: 0,
      target: 0,
      phase: 'calm',
      nextChange: performance.now() + 9000 + Math.random() * 10000,
    }
    let depositionCarry = 0
    let snowfallIntensity = 0.78
    let snowfallTarget = 0.78
    let currentSnowfallMix = activeRef.current && !aliveRef.current ? 1 : 0
    let nextSnowfallShift = performance.now() + 12000
    const driftPatternPhase = Math.random() * Math.PI * 2

    const snowDepthCeiling = () => Math.min(52, Math.max(28, height * 0.06))

    const driftCapAt = (index: number, windShift = 0) => {
      const sample = index - windShift
      const broad = Math.sin(sample * 0.040 + driftPatternPhase) * 0.46
      const middle = Math.sin(sample * 0.083 + driftPatternPhase * 1.43 + 1.15) * 0.28
      const long = Math.sin(sample * 0.018 + driftPatternPhase * 0.67 + 2.2) * 0.26
      const shaped = Math.max(0, Math.min(1, 0.50 + broad + middle + long))
      const soft = shaped * shaped * (3 - 2 * shaped)
      const ceiling = snowDepthCeiling()
      return 7 + soft * (ceiling - 7)
    }


    const createFlake = (randomY = false): Flake => {
      const depth = Math.random()
      const size = 0.65 + depth * 2.5
      return {
        x: Math.random() * width,
        y: randomY ? Math.random() * height : -16 - Math.random() * 90,
        size,
        vy: 0.16 + depth * 0.62,
        vx: -0.025 + Math.random() * 0.05,
        drift: 0.05 + Math.random() * 0.25,
        phase: Math.random() * Math.PI * 2,
        alpha: 0.12 + depth * 0.34,
        depth,
        rotation: Math.random() * Math.PI * 2,
        spin: (-0.002 + Math.random() * 0.004) * (0.5 + depth),
        seed: Math.random() * 1000,
        arms: 6,
        branch: 0.42 + Math.random() * 0.28,
        presence: Math.random(),
      }
    }

    const resetCanvas = () => {
      width = window.innerWidth
      height = window.innerHeight
      dpr = Math.min(window.devicePixelRatio || 1, 1.5)
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

      const count = Math.min(230, Math.max(85, Math.floor((width * height) / 7600)))
      flakes = Array.from({ length: count }, () => createFlake(true))
      ensureWorld(width, height)
      drifts = pitchWorld.drifts
      if (driftSnapshot.length !== drifts.length) driftSnapshot = new Float32Array(drifts.length)
    }

    const settle = (flake: Flake) => {
      const idx = Math.max(3, Math.min(drifts.length - 4, Math.floor(flake.x / 6)))
      // Visible flakes should suggest accumulation, not secretly build mountains.
      // Most long-term accumulation is handled by depositWorldSnow below.
      const amount = flake.size * (0.034 + flake.depth * 0.022) * currentSnowfallMix

      for (let offset = -3; offset <= 3; offset++) {
        const i = idx + offset
        const falloff = offset === 0 ? 1 : offset === -1 || offset === 1 ? 0.62 : offset === -2 || offset === 2 ? 0.30 : 0.10
        const cap = driftCapAt(i)
        drifts[i] = Math.min(cap, drifts[i] + amount * falloff)
      }
    }

    const updateWind = (time: number) => {
      if (time > wind.nextChange) {
        if (wind.phase === 'calm') {
          wind.phase = 'building'
          wind.target = (Math.random() > 0.5 ? 1 : -1) * (0.22 + Math.random() * 0.38)
          wind.nextChange = time + 3500 + Math.random() * 3500
        } else if (wind.phase === 'building') {
          wind.phase = 'gusting'
          wind.target *= 1.8 + Math.random() * 0.9
          wind.nextChange = time + 2200 + Math.random() * 3200
        } else if (wind.phase === 'gusting') {
          wind.phase = 'settling'
          wind.target *= 0.22
          wind.nextChange = time + 5000 + Math.random() * 5000
        } else {
          wind.phase = 'calm'
          wind.target = 0
          wind.nextChange = time + 14000 + Math.random() * 24000
        }
      }
      wind.value += (wind.target - wind.value) * 0.0035
    }

    const effectiveWind = () =>
      wind.value + stormSignal.wind * stormSignal.mix * 1.55

    const smoothDrifts = () => {
      if (frame % 8 !== 0) return
      driftSnapshot.set(drifts)
      const copy = driftSnapshot
      for (let i = 2; i < drifts.length - 2; i++) {
        // Five samples only: enough diffusion for rounded, pillow-like banks
        // without the expensive contour work that hurt earlier snow builds.
        const smoothed =
          copy[i] * 0.78 +
          (copy[i - 1] + copy[i + 1]) * 0.08 +
          (copy[i - 2] + copy[i + 2]) * 0.03

        // Fresh burns protect their little crater from immediately being ironed
        // flat by the normal snow diffusion. As heat/char fades, snow can heal it.
        const scarMemory = Math.min(0.92, pitchWorld.ember[i] * 0.48 + pitchWorld.char[i] * 0.92)
        drifts[i] = smoothed * (1 - scarMemory) + copy[i] * scarMemory

        const rightSlope = drifts[i] - drifts[i + 1]
        if (rightSlope > 5.4) {
          const slide = Math.min((rightSlope - 5.4) * 0.012, 0.095)
          drifts[i] -= slide
          drifts[i + 1] += slide * 0.99
        }
        const leftSlope = drifts[i] - drifts[i - 1]
        if (leftSlope > 5.4) {
          const slide = Math.min((leftSlope - 5.4) * 0.012, 0.095)
          drifts[i] -= slide
          drifts[i - 1] += slide * 0.99
        }
      }
    }

    const erodeDrifts = () => {
      const currentWind = effectiveWind()
      if (Math.abs(currentWind) < 0.30 || frame % 5 !== 0) return

      const direction = currentWind > 0 ? 1 : -1
      const strength = Math.min(2.65, Math.abs(currentWind))
      const stormBoost = 1 + stormSignal.mix * 1.35
      const start = direction > 0 ? 3 : drifts.length - 4
      const end = direction > 0 ? drifts.length - 3 : 2

      for (let i = start; i !== end; i += direction) {
        const upwind = Math.max(1, Math.min(drifts.length - 2, i - direction))
        const downwind = Math.max(1, Math.min(drifts.length - 2, i + direction))
        const localAverage = (drifts[upwind] + drifts[downwind]) * 0.5
        const exposed = Math.max(0, drifts[i] - localAverage)

        // Wind mostly moves exposed powder, leaving the broad bank intact.
        const moved = Math.min(
          0.075 * stormBoost,
          (0.006 + exposed * 0.0032) * strength * stormBoost
        )
        if (moved <= 0.002 || drifts[i] <= 0.6) continue

        const travel = Math.random() > 0.62 ? 3 : 2
        const landing = Math.max(
          2,
          Math.min(drifts.length - 3, i + direction * travel)
        )

        drifts[i] = Math.max(0, drifts[i] - moved)
        drifts[landing] += moved * 0.985
        drifts[landing - direction] += moved * 0.010

        if (
          exposed > 0.22 &&
          Math.random() < Math.min(0.38, strength * (0.050 + exposed * 0.006 + stormSignal.mix * 0.052)) &&
          loosePowder.length < 42
        ) {
          const maxLife = 74 + Math.random() * 94
          loosePowder.push({
            x: i * 6 + (Math.random() * 2 - 1) * 2.5,
            y: snowSurfaceYAtIndex(i, height) - 1 - Math.random() * 1.4,
            vx: direction * (0.22 + Math.random() * 0.58) * strength,
            vy: -0.035 - Math.random() * 0.16,
            life: maxLife,
            maxLife,
            alpha: 0.052 + Math.random() * 0.072,
            size: 0.34 + Math.random() * 0.52,
            phase: Math.random() * Math.PI * 2,
            swirl: 0.035 + Math.random() * 0.075,
          })
        }
      }
    }


    const combDriftCrests = () => {
      const currentWind = effectiveWind()
      if (Math.abs(currentWind) < 0.22 || frame % 24 !== 0 || drifts.length < 7) return

      driftSnapshot.set(drifts)
      const copy = driftSnapshot
      const direction = currentWind > 0 ? 1 : -1
      const strength = Math.min(2.2, Math.abs(currentWind))
      const stormLift = 1 + stormSignal.mix * 0.7
      const start = direction > 0 ? 3 : drifts.length - 4
      const end = direction > 0 ? drifts.length - 3 : 2

      for (let i = start; i !== end; i += direction) {
        if (copy[i] < 1.2) continue

        const upwind = i - direction
        const downwind = i + direction
        const shoulder = (copy[upwind] + copy[downwind]) * 0.5
        const exposed = copy[i] - shoulder
        if (exposed < 0.34) continue

        const transfer = Math.min(
          0.012 * stormLift,
          exposed * 0.0014 * strength * stormLift,
        )
        if (transfer <= 0.0008) continue

        const leeNear = Math.max(2, Math.min(drifts.length - 3, i + direction))
        const leeFar = Math.max(2, Math.min(drifts.length - 3, i + direction * 2))
        drifts[i] = Math.max(0, drifts[i] - transfer)
        drifts[leeNear] += transfer * 0.68
        drifts[leeFar] += transfer * 0.32
      }
    }

    const reshapeMatureDrifts = () => {
      if (frame % 12 !== 0) return
      const currentWind = effectiveWind()
      const windShift = currentWind * 6.0

      for (let i = 3; i < drifts.length - 3; i++) {
        const cap = driftCapAt(i, windShift)
        const excess = drifts[i] - cap
        if (excess <= 0) continue

        // Snow compacts and redistributes once a drift is mature. The visible
        // landscape therefore approaches several shallow banks instead of one
        // ever-growing pillow across the whole screen. This also gently repairs
        // oversized terrain saved by older builds.
        drifts[i] -= Math.min(0.24, excess * 0.085)
      }
    }

    const depositWorldSnow = (dt: number, simTime: number, snowfallMix: number) => {
      if (simTime > nextSnowfallShift) {
        snowfallTarget = 0.72 + Math.random() * 0.38
        nextSnowfallShift = simTime + 12000 + Math.random() * 22000
      }
      snowfallIntensity += (snowfallTarget - snowfallIntensity) * 0.0018

      if (snowfallMix <= 0.002) return

      // Background deposition is intentionally decoupled from visible flakes.
      // It runs at ~11Hz over the small 6px terrain grid: cheap, predictable,
      // and fast enough that a few real minutes create an actual snow world.
      depositionCarry += dt * snowfallMix
      const depositionIntervalMs = 92

      while (depositionCarry >= depositionIntervalMs) {
        depositionCarry -= depositionIntervalMs

        const currentWind = effectiveWind()
        const windShift = currentWind * 6.0
        const direction = currentWind >= 0 ? 1 : -1
        const baseAmount = 0.0085 + snowfallIntensity * 0.0065

        for (let i = 3; i < drifts.length - 3; i++) {
          const sample = i - windShift
          const cap = driftCapAt(i, windShift)
          const room = Math.max(0, cap - drifts[i])
          if (room <= 0.01) continue

          const broadA = (Math.sin(sample * 0.046 + driftPatternPhase + 0.4) + 1) * 0.5
          const broadB = (Math.sin(sample * 0.091 + driftPatternPhase * 1.37 + 2.0) + 1) * 0.5
          const bankShape = 0.62 + broadA * 0.28 + broadB * 0.18

          const upwind = Math.max(1, Math.min(drifts.length - 2, i - direction * 2))
          const downwind = Math.max(1, Math.min(drifts.length - 2, i + direction * 2))
          const shelterDelta = pitchWorld.ground[upwind] - pitchWorld.ground[downwind]
          const shelter = Math.max(0.86, Math.min(1.14, 1 + shelterDelta * 0.015 * Math.abs(currentWind)))

          // Hot/scorched ground resists fresh powder. Once the scar cools, snow
          // gradually wins and buries the history naturally.
          const heatMemory = Math.min(1, pitchWorld.ember[i] * 0.74 + pitchWorld.char[i] * 0.82)
          const thermalBlock = Math.max(0.05, 1 - heatMemory)
          const roomFactor = Math.max(0.18, Math.min(1, room / Math.max(1, cap * 0.58)))
          const amount = baseAmount * bankShape * shelter * snowfallIntensity * roomFactor * thermalBlock

          drifts[i] = Math.min(cap, drifts[i] + amount)
        }
      }
    }

    const consumeLightningStrike = () => {
      const signal = lightningGroundStrikeSignal
      if (signal.version === lastLightningVersion) return
      lastLightningVersion = signal.version
      if (signal.scene !== 'snow') return

      const centerY = snowSurfaceYAtIndex(signal.index, height) - 2
      const count = 12 + Math.floor(signal.strength * 9)
      for (let i = 0; i < count && loosePowder.length < 64; i++) {
        const side = Math.random() < 0.5 ? -1 : 1
        const maxLife = 68 + Math.random() * 82
        loosePowder.push({
          x: signal.x + (Math.random() - 0.5) * (10 + signal.strength * 8),
          y: centerY - Math.random() * 3,
          vx: side * (0.36 + Math.random() * 1.15) * (0.8 + signal.strength * 0.5),
          vy: -(0.22 + Math.random() * 0.78 + signal.strength * 0.18),
          life: maxLife,
          maxLife,
          alpha: 0.075 + Math.random() * 0.09,
          size: 0.42 + Math.random() * 0.86,
          phase: Math.random() * Math.PI * 2,
          swirl: 0.045 + Math.random() * 0.09,
        })
      }
    }

    const drawFlake = (f: Flake) => {
      ctx.save()
      ctx.translate(f.x, f.y)
      ctx.rotate(f.rotation)

      if (f.depth < 0.26) {
        ctx.beginPath()
        ctx.arc(0, 0, Math.max(0.55, f.size * 0.48), 0, Math.PI * 2)
        ctx.fillStyle = `rgba(226, 233, 239, ${f.alpha * 0.65})`
        ctx.fill()
        ctx.restore()
        return
      }

      const radius = f.size * (1.25 + f.depth * 0.65)
      ctx.strokeStyle = `rgba(231, 237, 242, ${f.alpha})`
      ctx.lineWidth = Math.max(0.32, 0.36 + f.depth * 0.28)
      ctx.lineCap = 'round'

      for (let arm = 0; arm < f.arms; arm++) {
        const angle = (Math.PI * 2 * arm) / f.arms
        const ex = Math.cos(angle) * radius
        const ey = Math.sin(angle) * radius
        ctx.beginPath()
        ctx.moveTo(0, 0)
        ctx.lineTo(ex, ey)

        if (f.depth > 0.55) {
          const bx = ex * f.branch
          const by = ey * f.branch
          const branchLength = radius * (0.18 + ((Math.sin(f.seed + arm) + 1) * 0.04))
          const a1 = angle + 0.72
          const a2 = angle - 0.72
          ctx.moveTo(bx, by)
          ctx.lineTo(bx - Math.cos(a1) * branchLength, by - Math.sin(a1) * branchLength)
          ctx.moveTo(bx, by)
          ctx.lineTo(bx - Math.cos(a2) * branchLength, by - Math.sin(a2) * branchLength)
        }
        ctx.stroke()
      }
      ctx.restore()
    }

    const updateFreeze = (dt: number, snowfallMix: number) => {
      if (snowfallMix <= 0.004 || pitchWorld.ice.length < 3) return

      const scaledDt = (dt / 16.67) * speed
      const surfaceWetness = pitchWorld.wetness

      for (let i = 1; i < pitchWorld.ice.length - 1; i++) {
        const pooled = Math.min(1, pitchWorld.water[i] / 2.8)
        const heatBlock = Math.min(0.96, pitchWorld.ember[i] * 0.92 + pitchWorld.char[i] * 0.24)
        const coldTarget = Math.min(1, surfaceWetness * 0.86 + pooled * 0.68) * (1 - heatBlock)
        if (coldTarget <= pitchWorld.ice[i] + 0.001) continue

        // The first flakes catch the pre-existing wet sheen rather than creating
        // a new visible material from nowhere. A soaked surface freezes in tens
        // of seconds; shallow puddles catch slightly faster.
        const freezeRate = (0.00052 + pooled * 0.00034) * scaledDt * snowfallMix
        pitchWorld.ice[i] = Math.min(coldTarget, pitchWorld.ice[i] + freezeRate)
      }

      // Some of the global wet sheen is now bound into the frozen skin. This is
      // deliberately slow so the transition reads as wet -> glassy -> snow.
      pitchWorld.wetness = Math.max(
        0,
        pitchWorld.wetness - 0.00018 * scaledDt * snowfallMix
      )
    }

    let lastFrameTime = performance.now()
    let simTime = performance.now()
    let weatherMix = activeRef.current && !aliveRef.current ? 1 : 0
    let wasActive = activeRef.current
    let aliveRiseTau = 34_000 + Math.random() * 8_000
    let aliveFallTau = 48_000 + Math.random() * 12_000
    let audioWeatherMix = weatherMix
    let freezeCarry = 0

    const draw = (time: number) => {
      frame += 1
      const dt = Math.min(34, time - lastFrameTime)
      lastFrameTime = time
      simTime += dt * speed

      const nowActive = activeRef.current
      if (nowActive && !wasActive) {
        if (aliveRef.current) {
          // Alive snow should arrive as weather rather than a switched canvas:
          // first flakes, then a steadily thickening fall over roughly 1–2 minutes.
          aliveRiseTau = 30_000 + Math.random() * 12_000
          aliveFallTau = 46_000 + Math.random() * 15_000
          for (let i = 0; i < flakes.length; i++) {
            flakes[i].y = -18 - Math.random() * Math.min(150, height * 0.18)
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

      // Density is deliberately steeper than opacity in Alive: the beginning of
      // a snow front is a handful of readable flakes, not a full blizzard at 8% alpha.
      const snowfallMix = aliveRef.current
        ? (nowActive
          ? Math.pow(Math.max(0, weatherMix), 2.8)
          : Math.pow(Math.max(0, weatherMix), 1.35))
        : weatherMix
      currentSnowfallMix = snowfallMix
      const visualAlpha = aliveRef.current
        ? (nowActive ? 0.58 + weatherMix * 0.42 : Math.sqrt(Math.max(0, weatherMix)))
        : weatherMix

      // Audio gets its own release envelope. Visually, the last flakes can become
      // very sparse while the hush of the snowfall still hangs in the room for a
      // while; tying gain directly to particle population made the scene sound as
      // though someone had switched it off.
      const audioTarget = nowActive ? 1 : 0
      const audioTau = aliveRef.current
        ? (nowActive ? Math.max(5_000, aliveRiseTau * 0.72) : 62_000)
        : 520
      const audioBlend = 1 - Math.exp(-dt / audioTau)
      audioWeatherMix += (audioTarget - audioWeatherMix) * audioBlend
      const audioDensity = aliveRef.current
        ? (nowActive ? Math.max(snowfallMix, audioWeatherMix * 0.58) : Math.pow(Math.max(0, audioWeatherMix), 0.82))
        : weatherMix

      const currentAudio = audioRef.current
      if (currentAudio) {
        const targetGain = soundOnRef.current ? 0.035 * audioDensity : 0
        if (currentAudio.gain !== lastAudioGainNode) {
          lastAudioGainNode = currentAudio.gain
          lastAudioTargetGain = Number.NaN
        }
        if (Math.abs(targetGain - lastAudioTargetGain) > 0.00002 || Number.isNaN(lastAudioTargetGain)) {
          currentAudio.gain.gain.setTargetAtTime(targetGain, currentAudio.ctx.currentTime, 0.7)
          lastAudioTargetGain = targetGain
        }
      } else {
        lastAudioGainNode = null
        lastAudioTargetGain = Number.NaN
      }

      if (weatherMix < 0.004 && !activeRef.current) {
        if (!idleCleared) {
          ctx.clearRect(0, 0, width, height)
          idleCleared = true
        }
        raf = requestAnimationFrame(draw)
        return
      }

      idleCleared = false
      ctx.clearRect(0, 0, width, height)
      ctx.globalAlpha = visualAlpha
      consumeLightningStrike()
      updateWind(simTime)
      const activeWind = effectiveWind()

      for (let i = 0; i < flakes.length; i++) {
        const f = flakes[i]
        const motionScale = Math.min(2.05, Math.max(0.75, 0.82 + Math.sqrt(speed) * 0.43))
        const sway = Math.sin(simTime * 0.00028 + f.phase + f.y * 0.009) * f.drift
        f.x += (f.vx + sway + activeWind * (0.12 + f.depth * 0.48)) * motionScale
        f.y += (f.vy + Math.abs(activeWind) * 0.06) * motionScale
        f.rotation += (f.spin + activeWind * 0.0006) * motionScale

        if (f.x < -24) f.x = width + 24
        if (f.x > width + 24) f.x = -24

        const driftIdx = Math.max(0, Math.min(drifts.length - 1, Math.floor(f.x / 6)))
        const floor = snowSurfaceYAtIndex(driftIdx, height) - 1
        const participating = f.presence <= snowfallMix
        if (!participating) {
          if (f.y >= floor) flakes[i] = createFlake(false)
          continue
        }
        const localHeat = pitchWorld.ember[driftIdx] || 0
        const heatZone = 10 + localHeat * 54

        if (localHeat > 0.10 && f.y >= floor - heatZone) {
          const vanishChance = Math.min(0.92, 0.10 + localHeat * 0.32)
          if (Math.random() < vanishChance) {
            flakes[i] = createFlake(false)
            continue
          }
        }

        // Fireflies only warm the air immediately around themselves. This
        // touches falling flakes only; accumulated drifts remain entirely in
        // the terrain simulation above/below and are never reduced here.
        if (fireflySignal.count > 0 && frame % 2 === (i & 1)) {
          const heatRadius = 9
          const heatRadiusSq = heatRadius * heatRadius
          let meltedByFirefly = false

          for (let j = 0; j < fireflySignal.count; j++) {
            const offset = j * 2
            const dx = f.x - fireflySignal.positions[offset]
            if (dx < -heatRadius || dx > heatRadius) continue
            const dy = f.y - fireflySignal.positions[offset + 1]
            if (dy < -heatRadius || dy > heatRadius) continue

            const distanceSq = dx * dx + dy * dy
            if (distanceSq < heatRadiusSq && Math.random() < 0.16) {
              meltedByFirefly = true
              break
            }
          }

          if (meltedByFirefly) {
            flakes[i] = createFlake(false)
            continue
          }
        }

        if (f.y >= floor) {
          if (localHeat < 0.16) settle(f)
          flakes[i] = createFlake(false)
          continue
        }

        drawFlake(f)
      }

      depositWorldSnow(dt, simTime, snowfallMix)
      reshapeMatureDrifts()
      erodeDrifts()
      combDriftCrests()
      smoothDrifts()
      freezeCarry += dt
      if (freezeCarry >= 48) {
        updateFreeze(Math.min(82, freezeCarry), snowfallMix)
        freezeCarry = 0
      }

      let powderWrite = 0
      const powderWind = effectiveWind()
      const powderMotionScale = Math.min(1.9, Math.max(0.7, 0.9 + speed * 0.13))
      for (let powderRead = 0; powderRead < loosePowder.length; powderRead++) {
        const p = loosePowder[powderRead]
        p.life -= Math.min(1.8, Math.max(0.8, 0.9 + speed * 0.12))
        if (p.life <= 0) continue

        const age = 1 - p.life / p.maxLife
        const lift = Math.sin(Math.min(1, age * 1.8) * Math.PI)
        const curl = Math.sin(simTime * 0.0042 + p.phase + p.x * 0.013) * p.swirl
        p.x += (p.vx + curl + powderWind * 0.028) * powderMotionScale
        p.y += p.vy - lift * 0.012 + Math.cos(simTime * 0.0034 + p.phase) * 0.008
        p.vy += 0.0042
        p.vx *= 0.9985

        if (p.x < -6 || p.x > width + 6) continue
        const fadeIn = Math.min(1, age * 5)
        const fadeOut = Math.min(1, p.life / Math.max(1, p.maxLife * 0.32))
        const visibleAlpha = p.alpha * fadeIn * fadeOut
        if (visibleAlpha <= 0.003) continue

        ctx.beginPath()
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(235, 241, 245, ${visibleAlpha})`
        ctx.fill()
        loosePowder[powderWrite++] = p
      }
      loosePowder.length = powderWrite

      ctx.globalAlpha = 1
      raf = requestAnimationFrame(draw)
    }

    resetCanvas()
    window.addEventListener('resize', resetCanvas)
    raf = requestAnimationFrame(draw)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resetCanvas)
    }
  }, [speed])

  return <canvas className="scene-canvas" ref={canvasRef} aria-hidden="true" />
}

