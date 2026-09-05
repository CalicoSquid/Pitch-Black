import { drawLotus, advanceLotus, type Lotus } from './lotus'
import { canvasPixelRatio } from '../rendering/canvasBudget'
import { useEffect, useRef } from 'react'
import type { Scene } from '../types'
import { getPitchAudio, getPitchAudioTransientOutput } from '../audio/pitchAudio'
import { fireflySignal } from '../world/fireflySignal'
import { lightningGroundStrikeSignal } from '../world/lightningSignal'
import {
  groundSurfaceYAtIndex,
  pitchWorld,
  standingWaterSurfaceY,
  stormSignal,
  worldIndexAt,
} from '../world/worldState'

type WaterLifeTestMode = 'lotus' | 'bubbles' | null

type Props = {
  scene: Scene
  stormActive: boolean
  soundOn: boolean
  moonVisible: boolean
  testMode?: WaterLifeTestMode
}

type Bubble = {
  x: number
  y: number
  vx: number
  vy: number
  radius: number
  born: number
  life: number
  phase: number
  trappedFirefly: boolean
}

const TAU = Math.PI * 2

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value))
}

function smoothstep(value: number) {
  const t = clamp01(value)
  return t * t * (3 - 2 * t)
}

function playWaterGurgle() {
  const audioCtx = getPitchAudio()
  if (!audioCtx || audioCtx.state !== 'running') return

  const out = getPitchAudioTransientOutput(audioCtx)
  const now = audioCtx.currentTime
  const duration = 0.82
  const master = audioCtx.createGain()
  const filter = audioCtx.createBiquadFilter()
  const noiseSource = audioCtx.createBufferSource()
  const low = audioCtx.createOscillator()

  // Broad, low filtered turbulence rather than a sequence of pitched "blips".
  // The previous owl experiment taught us that tiny synthetic notes read as UI
  // sounds very quickly; this should sit down inside the rain like real water.
  const buffer = audioCtx.createBuffer(1, Math.ceil(audioCtx.sampleRate * duration), audioCtx.sampleRate)
  const data = buffer.getChannelData(0)
  let brown = 0
  for (let i = 0; i < data.length; i++) {
    brown = brown * 0.965 + (Math.random() * 2 - 1) * 0.035
    const t = i / Math.max(1, data.length - 1)
    const pulse = 0.56 + Math.sin(t * Math.PI * 5.2) * 0.18 + Math.sin(t * Math.PI * 9.4 + 0.7) * 0.09
    data[i] = brown * pulse
  }
  noiseSource.buffer = buffer

  filter.type = 'lowpass'
  filter.frequency.setValueAtTime(310, now)
  filter.frequency.exponentialRampToValueAtTime(185, now + duration)
  filter.Q.value = 0.55

  master.gain.setValueAtTime(0.0001, now)
  master.gain.exponentialRampToValueAtTime(0.018, now + 0.07)
  master.gain.setValueAtTime(0.014, now + 0.32)
  master.gain.exponentialRampToValueAtTime(0.0001, now + duration)

  low.type = 'sine'
  low.frequency.setValueAtTime(67, now)
  low.frequency.exponentialRampToValueAtTime(46, now + 0.72)

  noiseSource.connect(filter)
  low.connect(filter)
  filter.connect(master)
  master.connect(out)

  const cleanup = () => {
    try { noiseSource.disconnect() } catch { /* harmless */ }
    try { low.disconnect() } catch { /* harmless */ }
    try { filter.disconnect() } catch { /* harmless */ }
    try { master.disconnect() } catch { /* harmless */ }
  }
  noiseSource.onended = cleanup

  noiseSource.start(now)
  low.start(now)
  noiseSource.stop(now + duration)
  low.stop(now + duration)
}

export function WaterLifeLayer({ scene, stormActive, soundOn, moonVisible, testMode = null }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const sceneRef = useRef(scene)
  const stormRef = useRef(stormActive)
  const soundRef = useRef(soundOn)
  const moonRef = useRef(moonVisible)
  const testRef = useRef(testMode)

  useEffect(() => { sceneRef.current = scene }, [scene])
  useEffect(() => { stormRef.current = stormActive }, [stormActive])
  useEffect(() => { soundRef.current = soundOn }, [soundOn])
  useEffect(() => { moonRef.current = moonVisible }, [moonVisible])
  useEffect(() => { testRef.current = testMode }, [testMode])

  // Water-life test routes should exercise the real standing-water system,
  // not draw a second synthetic surface above the world. Seed a modest amount
  // of real water for the duration of the test, then restore the user's state.
  useEffect(() => {
    if (testMode !== 'lotus' && testMode !== 'bubbles') return
    const previousWaterLevel = pitchWorld.waterLevel
    const previousWetness = pitchWorld.wetness
    pitchWorld.waterLevel = Math.max(pitchWorld.waterLevel, 0.16)
    pitchWorld.wetness = Math.max(pitchWorld.wetness, 0.18)
    return () => {
      pitchWorld.waterLevel = previousWaterLevel
      pitchWorld.wetness = previousWetness
    }
  }, [testMode])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d', { alpha: true })
    if (!ctx) return

    let width = 1
    let height = 1
    let dpr = canvasPixelRatio(width, height, 1.25)
    let raf = 0
    let idleTimer = 0
    let disposed = false
    let canvasCleared = true
    let previousHadBubbles = false
    let previousWaterY = Number.NaN
    let lotusId = 1
    let nextLotusAt = performance.now() + 45_000 + Math.random() * 75_000
    let nextBubbleAt = performance.now() + 7 * 60_000 + Math.random() * 8 * 60_000
    let rainBeganAt = 0
    let lastLightningVersion = lightningGroundStrikeSignal.version
    let testCycleAt = 0
    const lotuses: Lotus[] = []
    const bubbles: Bubble[] = []

    const resize = () => {
      const previousWidth = width
      width = window.innerWidth
      for (const lotus of lotuses) lotus.x *= width / Math.max(1, previousWidth)
      height = window.innerHeight
      dpr = canvasPixelRatio(width, height, 1.25)
      canvas.width = Math.max(1, Math.round(width * dpr))
      canvas.height = Math.max(1, Math.round(height * dpr))
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }

    const currentWaterY = () => standingWaterSurfaceY(height)

    const waterDepthAt = (x: number, waterY: number) => {
      if (!Number.isFinite(waterY)) return 0
      const idx = worldIndexAt(x, width)
      return groundSurfaceYAtIndex(idx, height) - waterY
    }

    const findWaterX = (waterY: number, preferred?: number) => {
      let bestX = -1
      let bestScore = Number.NEGATIVE_INFINITY
      const samples = preferred === undefined ? 18 : 64
      for (let i = 0; i < samples; i++) {
        const x = preferred !== undefined
          ? (i === 0 ? Math.max(width * 0.08, Math.min(width * 0.92, preferred)) : width * (0.08 + (i - 1) / (samples - 2) * 0.84))
          : width * (0.08 + Math.random() * 0.84)
        const idx = worldIndexAt(x, width)
        if ((pitchWorld.ice[idx] || 0) > 0.34) continue
        const depth = waterDepthAt(x, waterY)
        if (depth <= 5) continue
        if (preferred !== undefined && lotuses.some(lotus => Math.abs(lotus.x - x) < Math.max(44, width * 0.075))) continue
        // Favor the intended spacing once the water is deep enough; repeatedly
        // selecting the deepest sample packs neighboring flowers into one spot.
        const score = preferred === undefined ? depth : Math.min(depth, 12) * 0.2 - Math.abs(x - preferred)
        if (score > bestScore) {
          bestScore = score
          bestX = x
        }
      }
      return bestX
    }

    const spawnLotusCluster = (now: number, waterY: number) => {
      const count = testRef.current === 'lotus' ? 3 : 1 + (Math.random() < 0.36 ? 1 : 0) + (Math.random() < 0.08 ? 1 : 0)
      const center = width * (0.24 + Math.random() * 0.52)
      const spacing = count === 1 ? 0 : count === 2 ? width * 0.12 : width * 0.145
      for (let i = 0; i < count; i++) {
        const preferred = center + (i - (count - 1) / 2) * spacing + (Math.random() - 0.5) * width * 0.028
        const x = findWaterX(waterY, preferred)
        if (x < 0) continue
        lotuses.push({
          id: lotusId++,
          x,
          scale: (testRef.current === 'lotus' ? 1.04 : 0.98) + Math.random() * 0.3,
          hue: Math.floor(Math.random() * 12),
          state: 'shoot',
          stateStarted: now + i * (1_400 + Math.random() * 1_500),
          riseDuration: testRef.current === 'lotus' ? 5_800 + i * 900 : 7_000 + Math.random() * 7_000,
          openDuration: testRef.current === 'lotus' ? 11_000 + i * 1_800 : 20_000 + Math.random() * 22_000,
          closeDuration: 18_000 + Math.random() * 14_000,
          burnSeed: Math.random() * TAU,
        })
      }
      nextLotusAt = now + 14 * 60_000 + Math.random() * 22 * 60_000
    }


    const spawnBubbleBath = (now: number, waterY: number) => {
      const originX = findWaterX(waterY)
      if (originX < 0) return
      const count = testRef.current === 'bubbles' ? 8 : 4 + Math.floor(Math.random() * 5)
      for (let i = 0; i < count; i++) {
        const bubble: Bubble = {
          x: originX + (Math.random() - 0.5) * 34,
          y: waterY - 1,
          vx: (Math.random() - 0.5) * 8,
          vy: -(8 + Math.random() * 13),
          radius: 2.8 + Math.random() * 7.4,
          born: now + i * (150 + Math.random() * 220),
          life: 10_000 + Math.random() * 9_000,
          phase: Math.random() * TAU,
          trappedFirefly: false,
        }
        bubbles.push(bubble)
      }
      if (soundRef.current) playWaterGurgle()
      nextBubbleAt = now + 11 * 60_000 + Math.random() * 17 * 60_000
    }

    const updateLotuses = (now: number, wetWeather: boolean) => {
      for (let i = lotuses.length - 1; i >= 0; i--) {
        if (!advanceLotus(lotuses[i], now, wetWeather)) lotuses.splice(i, 1)
      }
    }

    const processLightning = (now: number) => {
      if (lightningGroundStrikeSignal.version === lastLightningVersion) return
      lastLightningVersion = lightningGroundStrikeSignal.version
      const strikeX = lightningGroundStrikeSignal.x
      const strength = lightningGroundStrikeSignal.strength
      for (const lotus of lotuses) {
        if (lotus.state === 'burning' || lotus.state === 'charred') continue
        const hitRadius = 42 + strength * 42
        if (Math.abs(lotus.x - strikeX) <= hitRadius) {
          lotus.state = 'burning'
          lotus.stateStarted = now
        }
      }
    }

    const updateBubbles = (now: number, dt: number) => {
      const wind = stormSignal.wind
      const scaled = Math.min(0.05, dt / 1000)
      for (let i = bubbles.length - 1; i >= 0; i--) {
        const bubble = bubbles[i]
        if (now < bubble.born) continue
        const age = now - bubble.born
        if (age >= bubble.life || bubble.y < -bubble.radius * 3 || bubble.x < -80 || bubble.x > width + 80) {
          bubbles.splice(i, 1)
          continue
        }
        const maturity = clamp01(age / bubble.life)
        bubble.vx += (wind * 4.8 + Math.sin(now * 0.0006 + bubble.phase) * 1.4) * scaled
        bubble.vy -= 0.52 * scaled
        bubble.x += bubble.vx * scaled
        bubble.y += bubble.vy * scaled

        if (!bubble.trappedFirefly && fireflySignal.count > 0) {
          for (let f = 0; f < fireflySignal.count; f++) {
            const fireflyX = fireflySignal.positions[f * 2]
            const fireflyY = fireflySignal.positions[f * 2 + 1]
            const captureRadius = Math.max(7, bubble.radius + 4)
            if (Math.hypot(fireflyX - bubble.x, fireflyY - bubble.y) > captureRadius) continue
            const id = fireflySignal.ids[f]
            if (!id) continue
            fireflySignal.extinguishRequests[f] = id
            bubble.trappedFirefly = true
            break
          }
        }

        // Mature bubbles become slightly larger as pressure drops while they rise.
        bubble.radius *= 1 + 0.010 * scaled * (0.35 + maturity)
      }
    }

    const drawBubbles = (now: number) => {
      const flash = clamp01(stormSignal.flash)
      for (const bubble of bubbles) {
        if (now < bubble.born) continue
        const age = now - bubble.born
        const lifeT = clamp01(age / bubble.life)
        const fade = smoothstep(Math.min(1, age / 900)) * (1 - smoothstep(Math.max(0, (lifeT - 0.76) / 0.24)))
        const gathered = 0.06 + lifeT * 0.16 + flash * 0.32 + (moonRef.current ? lifeT * 0.035 : 0)
        const wobbleX = Math.sin(now * 0.0019 + bubble.phase) * bubble.radius * 0.12
        const x = bubble.x + wobbleX
        const y = bubble.y

        ctx.save()
        ctx.globalAlpha = fade
        ctx.lineWidth = 0.55
        ctx.strokeStyle = `rgba(205, 221, 232, ${gathered})`
        ctx.beginPath()
        ctx.arc(x, y, bubble.radius, 0, TAU)
        ctx.stroke()

        // A tiny moving glint lets lightning/moonlight catch the bubble without
        // turning it into a bright UI-looking circle.
        const glintAlpha = gathered * (0.55 + flash * 0.8)
        ctx.beginPath()
        ctx.arc(x - bubble.radius * 0.32, y - bubble.radius * 0.34, Math.max(0.45, bubble.radius * 0.09), 0, TAU)
        ctx.fillStyle = `rgba(236, 242, 246, ${glintAlpha})`
        ctx.fill()

        if (bubble.trappedFirefly) {
          const pulse = 0.58 + Math.sin(now * 0.006 + bubble.phase) * 0.22
          const glow = ctx.createRadialGradient(x, y, 0, x, y, bubble.radius * 1.5)
          glow.addColorStop(0, `rgba(231, 208, 88, ${0.38 * pulse})`)
          glow.addColorStop(0.28, `rgba(205, 184, 72, ${0.16 * pulse})`)
          glow.addColorStop(1, 'rgba(180, 165, 70, 0)')
          ctx.fillStyle = glow
          ctx.beginPath()
          ctx.arc(x, y, bubble.radius * 1.5, 0, TAU)
          ctx.fill()
          ctx.beginPath()
          ctx.arc(x, y, 1.05, 0, TAU)
          ctx.fillStyle = `rgba(244, 225, 113, ${0.62 * pulse})`
          ctx.fill()
        }
        ctx.restore()
      }
    }

    let lastFrame = performance.now()
    const draw = (now: number) => {
      if (disposed) return
      const dt = Math.max(0, Math.min(80, now - lastFrame))
      lastFrame = now
      const test = testRef.current
      const waterY = currentWaterY()
      const actualWater = Number.isFinite(waterY) && (test !== null || pitchWorld.waterLevel > 0.085)
      const currentScene = sceneRef.current
      const wetWeather = currentScene === 'rain'
        || (stormRef.current && currentScene === 'calm')
        || test === 'lotus'
        || test === 'bubbles'

      if (wetWeather) {
        if (rainBeganAt <= 0) rainBeganAt = now
      } else {
        rainBeganAt = 0
      }

      // A reset/fully drained world must not leave invisible animated actors
      // keeping this layer hot. The persistent water simulation owns whether
      // there is a surface for these events to exist on at all.
      if (test === null && (!actualWater || currentScene === 'black')) {
        lotuses.length = 0
        bubbles.length = 0
      }

      if (actualWater && test === 'lotus' && now >= testCycleAt && lotuses.length === 0) {
        spawnLotusCluster(now, waterY)
        testCycleAt = now + 55_000
      } else if (actualWater && test === 'bubbles' && now >= testCycleAt && bubbles.length === 0) {
        spawnBubbleBath(now, waterY)
        testCycleAt = now + 27_000
      }

      if (actualWater && wetWeather && test === null) {
        const sustained = rainBeganAt > 0 && now - rainBeganAt >= 38_000
        if (sustained && lotuses.length === 0 && now >= nextLotusAt) spawnLotusCluster(now, waterY)
        if (now >= nextBubbleAt && bubbles.length === 0) spawnBubbleBath(now, waterY)
      }

      updateLotuses(now, wetWeather)
      updateBubbles(now, dt)
      processLightning(now)

      const hasLotuses = lotuses.length > 0
      const hasBubbles = bubbles.length > 0
      const hasLife = hasLotuses || hasBubbles

      if (!canvasCleared) {
        // Bubbles can travel across the whole viewport, so they require one full
        // clear while present (and once after they finish). Lotus-only frames do
        // not: repeatedly clearing a multi-megapixel transparent canvas at 60Hz
        // was enough to overwhelm weaker overnight devices when Rain was already
        // animating underneath. Keep lotus cleanup local to the waterline band.
        if (hasBubbles || previousHadBubbles || !Number.isFinite(waterY) || !Number.isFinite(previousWaterY)) {
          ctx.clearRect(0, 0, width, height)
        } else {
          const top = Math.max(0, Math.min(waterY, previousWaterY) - 72)
          const bottom = Math.min(height, Math.max(waterY, previousWaterY) + 28)
          ctx.clearRect(0, top, width, Math.max(1, bottom - top))
        }
      }
      canvasCleared = !(actualWater && hasLife)
      if (actualWater) {
        const flash = clamp01(stormSignal.flash)
        for (const lotus of lotuses) drawLotus(ctx, lotus, waterY, now, flash)
        drawBubbles(now)
      }
      previousHadBubbles = hasBubbles
      previousWaterY = waterY

      cancelAnimationFrame(raf)
      window.clearTimeout(idleTimer)

      // WaterLife is deliberately low-frequency compared with the weather
      // renderer. Bubble motion still gets a smooth 30fps cadence. Growing,
      // opening, closing, sinking or burning lotuses update at 24fps. A resting
      // bud/open flower only needs 6fps for its sub-pixel sway/light response.
      // With no actors, retain the original 2Hz overnight heartbeat.
      const lotusInMotion = lotuses.some(lotus =>
        lotus.state === 'shoot'
        || lotus.state === 'opening'
        || lotus.state === 'closing'
        || lotus.state === 'sinking'
        || lotus.state === 'burning'
        || lotus.state === 'charred'
      )
      const lightningActive = clamp01(stormSignal.flash) > 0.02
      const delay = hasBubbles
        ? 33
        : lotusInMotion || lightningActive
          ? 42
          : hasLotuses || test !== null
            ? 167
            : 500

      idleTimer = window.setTimeout(() => {
        // Only discard elapsed time while truly idle. Active bubble physics must
        // receive the full scheduled dt rather than just the final rAF delay.
        if (!hasLife && test === null) lastFrame = performance.now()
        raf = requestAnimationFrame(draw)
      }, delay)
    }

    resize()
    window.addEventListener('resize', resize)
    raf = requestAnimationFrame(draw)

    return () => {
      disposed = true
      cancelAnimationFrame(raf)
      window.clearTimeout(idleTimer)
      window.removeEventListener('resize', resize)
      ctx.clearRect(0, 0, width, height)
    }
  }, [])

  return <canvas className="scene-canvas water-life-layer-canvas" ref={canvasRef} aria-hidden="true" />
}
