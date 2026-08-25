import { useEffect, useRef } from 'react'
import { getPitchAudio, getPitchAudioOutput } from '../audio/pitchAudio'
import { fireflySignal } from '../world/fireflySignal'
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
}

type WindState = {
  value: number
  target: number
  phase: 'calm' | 'building' | 'gusting' | 'settling'
  nextChange: number
}


export function SnowScene({ soundOn, speed, active }: { soundOn: boolean; speed: number; active: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const activeRef = useRef(active)
  const soundOnRef = useRef(soundOn)
  const audioRef = useRef<{ ctx: AudioContext; gain: GainNode; source: AudioBufferSourceNode } | null>(null)

  useEffect(() => {
    activeRef.current = active
  }, [active])

  useEffect(() => {
    soundOnRef.current = soundOn
  }, [soundOn])

  useEffect(() => {
    if (!soundOn) {
      if (audioRef.current) {
        audioRef.current.gain.gain.setTargetAtTime(0, audioRef.current.ctx.currentTime, 0.6)
        window.setTimeout(() => {
          audioRef.current?.source.stop()
          audioRef.current = null
        }, 900)
      }
      return
    }

    const audioCtx = getPitchAudio()
    if (!audioCtx) return
    if (audioCtx.state === 'suspended') void audioCtx.resume()
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
    let dpr = Math.min(window.devicePixelRatio || 1, 2)
    let flakes: Flake[] = []
    let loosePowder: Array<{ x: number; y: number; vx: number; vy: number; life: number; alpha: number; size: number }> = []
    let drifts = pitchWorld.drifts
    let wind: WindState = {
      value: 0,
      target: 0,
      phase: 'calm',
      nextChange: performance.now() + 9000 + Math.random() * 10000,
    }
    let depositionCarry = 0
    let snowfallIntensity = 0.78
    let snowfallTarget = 0.78
    let nextSnowfallShift = performance.now() + 12000
    const driftPatternPhase = Math.random() * Math.PI * 2


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
      }
    }

    const resetCanvas = () => {
      width = window.innerWidth
      height = window.innerHeight
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

      const count = Math.min(230, Math.max(85, Math.floor((width * height) / 7600)))
      flakes = Array.from({ length: count }, () => createFlake(true))
      ensureWorld(width, height)
      drifts = pitchWorld.drifts
    }

    const settle = (flake: Flake) => {
      const idx = Math.max(3, Math.min(drifts.length - 4, Math.floor(flake.x / 6)))
      const maxDepth = Math.min(118, Math.max(58, height * 0.12))
      const amount = flake.size * (0.42 + flake.depth * 0.22) * weatherMix

      drifts[idx] = Math.min(maxDepth, drifts[idx] + amount)
      drifts[idx - 1] = Math.min(maxDepth, drifts[idx - 1] + amount * 0.62)
      drifts[idx + 1] = Math.min(maxDepth, drifts[idx + 1] + amount * 0.62)
      drifts[idx - 2] = Math.min(maxDepth, drifts[idx - 2] + amount * 0.30)
      drifts[idx + 2] = Math.min(maxDepth, drifts[idx + 2] + amount * 0.30)
      drifts[idx - 3] = Math.min(maxDepth, drifts[idx - 3] + amount * 0.10)
      drifts[idx + 3] = Math.min(maxDepth, drifts[idx + 3] + amount * 0.10)
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
      const copy = drifts.slice()
      for (let i = 2; i < drifts.length - 2; i++) {
        // Five samples only: enough diffusion for rounded, pillow-like banks
        // without the expensive contour work that hurt earlier snow builds.
        drifts[i] =
          copy[i] * 0.78 +
          (copy[i - 1] + copy[i + 1]) * 0.08 +
          (copy[i - 2] + copy[i + 2]) * 0.03

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
          Math.random() < Math.min(0.34, strength * (0.055 + stormSignal.mix * 0.052)) &&
          loosePowder.length < 36
        ) {
          loosePowder.push({
            x: i * 6,
            y: snowSurfaceYAtIndex(i, height) - 1,
            vx: direction * (0.28 + Math.random() * 0.72) * strength,
            vy: -0.05 - Math.random() * 0.19,
            life: 60 + Math.random() * 76,
            alpha: 0.040 + Math.random() * 0.070,
            size: 0.32 + Math.random() * 0.58,
          })
        }
      }
    }

    const depositWorldSnow = (dt: number, simTime: number) => {
      if (simTime > nextSnowfallShift) {
        snowfallTarget = 0.72 + Math.random() * 0.38
        nextSnowfallShift = simTime + 12000 + Math.random() * 22000
      }
      snowfallIntensity += (snowfallTarget - snowfallIntensity) * 0.0018

      if (weatherMix <= 0.002) return

      // Background deposition is intentionally decoupled from visible flakes.
      // It runs at ~11Hz over the small 6px terrain grid: cheap, predictable,
      // and fast enough that a few real minutes create an actual snow world.
      depositionCarry += dt * weatherMix
      const depositionIntervalMs = 88
      const maxDepth = Math.min(118, Math.max(58, height * 0.12))

      while (depositionCarry >= depositionIntervalMs) {
        depositionCarry -= depositionIntervalMs

        const currentWind = effectiveWind()
        const windShift = currentWind * 7.5
        const direction = currentWind >= 0 ? 1 : -1
        const baseAmount = 0.021 + snowfallIntensity * 0.0105

        for (let i = 3; i < drifts.length - 3; i++) {
          const sample = i - windShift

          // Two very low-frequency waves make large pillow-like banks rather
          // than a uniform white strip or lots of tiny videogame bumps.
          const broadA =
            (Math.sin(sample * 0.052 + driftPatternPhase) + 1) * 0.5
          const broadB =
            (Math.sin(sample * 0.021 + driftPatternPhase * 1.71 + 1.4) + 1) * 0.5
          const bankShape = 0.28 + broadA * 0.70 + broadB * 0.30

          // Small leeward preference means gusts slowly change where snow
          // fattens up, while keeping the profile broad and stable.
          const upwind = Math.max(1, Math.min(drifts.length - 2, i - direction * 2))
          const downwind = Math.max(1, Math.min(drifts.length - 2, i + direction * 2))
          const shelterDelta = pitchWorld.ground[upwind] - pitchWorld.ground[downwind]
          const shelter = Math.max(0.82, Math.min(1.18, 1 + shelterDelta * 0.018 * Math.abs(currentWind)))

          // Existing banks catch a touch more powder, which lets soft drifts
          // emerge without making sharp runaway peaks.
          const capture = 0.94 + Math.min(0.16, (drifts[i] / maxDepth) * 0.16)
          const amount = baseAmount * bankShape * shelter * capture * snowfallIntensity

          drifts[i] = Math.min(maxDepth, drifts[i] + amount)
        }
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

    const drawDrifts = (_time: number) => {
      pitchWorld.wetness = Math.max(0, pitchWorld.wetness - 0.00025 * speed * weatherMix)
    }

    let lastFrameTime = performance.now()
    let simTime = performance.now()
    let weatherMix = activeRef.current ? 1 : 0

    const draw = (time: number) => {
      frame += 1
      const dt = Math.min(34, time - lastFrameTime)
      lastFrameTime = time
      simTime += dt * speed

      const targetMix = activeRef.current ? 1 : 0
      const blend = 1 - Math.exp(-dt / 900)
      weatherMix += (targetMix - weatherMix) * blend

      ctx.clearRect(0, 0, width, height)
      if (audioRef.current) {
        const targetGain = soundOnRef.current ? 0.035 * weatherMix : 0
        audioRef.current.gain.gain.setTargetAtTime(targetGain, audioRef.current.ctx.currentTime, 0.18)
      }

      if (weatherMix < 0.004 && !activeRef.current) {
        raf = requestAnimationFrame(draw)
        return
      }

      ctx.globalAlpha = weatherMix
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

      depositWorldSnow(dt, simTime)
      erodeDrifts()
      smoothDrifts()
      drawDrifts(simTime)

      loosePowder = loosePowder.filter((p) => {
        p.life -= Math.min(1.8, Math.max(0.8, 0.9 + speed * 0.12))
        if (p.life <= 0) return false
        p.x += p.vx * Math.min(1.9, Math.max(0.7, 0.9 + speed * 0.13))
        p.y += p.vy
        p.vy += 0.006
        p.alpha *= 0.991
        if (p.x < -5 || p.x > width + 5) return false
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(235, 241, 245, ${p.alpha})`
        ctx.fill()
        return true
      })

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

