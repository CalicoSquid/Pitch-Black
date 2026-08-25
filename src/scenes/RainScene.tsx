import { useEffect, useRef } from 'react'
import { getPitchAudio, getPitchAudioOutput } from '../audio/pitchAudio'
import { fireflySignal } from '../world/fireflySignal'
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
}

export function RainScene({ soundOn, speed, active }: { soundOn: boolean; speed: number; active: boolean }) {
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
        const current = audioRef.current
        current.gain.gain.setTargetAtTime(0, current.ctx.currentTime, 0.45)
        window.setTimeout(() => {
          try { current.source.stop() } catch { /* already stopped */ }
          if (audioRef.current === current) audioRef.current = null
        }, 700)
      }
      return
    }

    const audioCtx = getPitchAudio()
    if (!audioCtx) return
    if (audioCtx.state === 'suspended') void audioCtx.resume()
    const seconds = 4
    const buffer = audioCtx.createBuffer(1, audioCtx.sampleRate * seconds, audioCtx.sampleRate)
    const data = buffer.getChannelData(0)

    let low = 0
    let high = 0
    for (let i = 0; i < data.length; i++) {
      const white = Math.random() * 2 - 1
      low = low * 0.94 + white * 0.06
      high = white - low
      const patter = Math.random() > 0.992 ? Math.random() * 0.45 : 0
      data[i] = low * 0.18 + high * 0.035 + patter
    }

    const source = audioCtx.createBufferSource()
    source.buffer = buffer
    source.loop = true

    const filter = audioCtx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = 2100

    const gain = audioCtx.createGain()
    gain.gain.value = 0

    source.connect(filter).connect(gain).connect(getPitchAudioOutput(audioCtx))
    source.start()
    gain.gain.setTargetAtTime(0.045, audioCtx.currentTime, 1.1)
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

    let raf = 0
    let frame = 0
    let width = window.innerWidth
    let height = window.innerHeight
    let dpr = Math.min(window.devicePixelRatio || 1, 2)
    let drops: RainDrop[] = []
    let ripples: Ripple[] = []
    let splashes: Splash[] = []
    let intensity = 0.72
    let targetIntensity = 0.72
    let nextWeatherShift = performance.now() + 12000

    const waterline = () => worldBaseY(height)

    const makeDrop = (randomY = false): RainDrop => {
      const depth = Math.random()
      return {
        x: Math.random() * width,
        y: randomY ? Math.random() * waterline() : -20 - Math.random() * 120,
        length: 3 + depth * 10,
        speed: 3.2 + depth * 5.3,
        alpha: 0.085 + depth * 0.27,
        width: 0.35 + depth * 0.45,
      }
    }

    const resize = () => {
      width = window.innerWidth
      height = window.innerHeight
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ensureWorld(width, height)

      const count = Math.min(150, Math.max(55, Math.floor((width * height) / 12500)))
      drops = Array.from({ length: count }, () => makeDrop(true))
      ripples = []
      splashes = []
    }

    const impact = (drop: RainDrop) => {
      const idx = Math.max(1, Math.min(pitchWorld.drifts.length - 2, Math.floor((drop.x / width) * (pitchWorld.drifts.length - 1))))
      const snowDepth = pitchWorld.drifts[idx]
      const y = surfaceYAt(drop.x, width, height)

      if (snowDepth > 1.2) {
        const melt = (0.34 + drop.speed * 0.026) * Math.max(1, speed * 0.78)
        pitchWorld.drifts[idx] = Math.max(0, pitchWorld.drifts[idx] - melt)
        pitchWorld.drifts[idx - 1] = Math.max(0, pitchWorld.drifts[idx - 1] - melt * 0.38)
        pitchWorld.drifts[idx + 1] = Math.max(0, pitchWorld.drifts[idx + 1] - melt * 0.38)
        pitchWorld.wetness = Math.min(1, pitchWorld.wetness + 0.0035)
      }
      const remainingSnow = pitchWorld.drifts[idx]
      if (remainingSnow < 7) {
        const collection = (0.055 + drop.speed * 0.006) * Math.max(1, speed * 0.45)
        pitchWorld.water[idx] = Math.min(9, pitchWorld.water[idx] + collection)
        pitchWorld.water[idx - 1] = Math.min(9, pitchWorld.water[idx - 1] + collection * 0.32)
        pitchWorld.water[idx + 1] = Math.min(9, pitchWorld.water[idx + 1] + collection * 0.32)
      }

      const watery = Math.max(0.15, 1 - snowDepth / 18)
      if (Math.random() < watery) {
        ripples.push({
          x: drop.x,
          y: Math.min(height - 1, y + Math.min(2, snowDepth * 0.06)),
          age: 0,
          life: 1250 + Math.random() * 800,
          maxRadius: 14 + Math.random() * 29,
          alpha: (0.12 + Math.random() * 0.12) * watery,
        })
      }

      if (Math.random() > 0.42) {
        splashes.push({
          x: drop.x,
          y,
          age: 0,
          life: 360 + Math.random() * 240,
          size: 2.4 + Math.random() * 4.2,
          alpha: 0.13 + Math.random() * 0.12,
        })
      }
    }

    const drawWater = () => {
      // The old bottom-of-screen water strip is intentionally gone.
      // Persistent pools are now rendered against the raised terrain surface.
    }

    const drawDrop = (drop: RainDrop) => {
      const stormWind = stormSignal.wind * stormSignal.mix
      const slant = drop.length * (0.08 + stormWind * 0.10)
      ctx.beginPath()
      ctx.moveTo(drop.x, drop.y)
      ctx.lineTo(drop.x - slant, drop.y + drop.length)
      ctx.strokeStyle = `rgba(192, 211, 224, ${drop.alpha})`
      ctx.lineWidth = drop.width
      ctx.lineCap = 'round'
      ctx.stroke()
    }

    const tryExtinguishFirefly = (drop: RainDrop, weatherMix: number) => {
      if (!activeRef.current || weatherMix < 0.42 || fireflySignal.count === 0) return

      const stormWind = stormSignal.wind * stormSignal.mix
      const ax = drop.x
      const ay = drop.y
      const bx = drop.x - drop.length * (0.08 + stormWind * 0.10)
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

        if (dx * dx + dy * dy <= hitRadiusSq && Math.random() < 0.012 * intensity * weatherMix) {
          fireflySignal.extinguishRequests[i] = fireflySignal.ids[i]
          return
        }
      }
    }

    const updateWeather = (time: number) => {
      if (time > nextWeatherShift) {
        targetIntensity = 0.46 + Math.random() * 0.52
        nextWeatherShift = time + 9000 + Math.random() * 18000
      }
      intensity += (targetIntensity - intensity) * 0.0016
    }

    let lastTime = performance.now()
    let simTime = performance.now()
    let weatherMix = activeRef.current ? 1 : 0
    const draw = (time: number) => {
      frame += 1
      const dt = Math.min(32, time - lastTime)
      lastTime = time
      simTime += dt * speed

      const targetMix = activeRef.current ? 1 : 0
      const blend = 1 - Math.exp(-dt / 900)
      weatherMix += (targetMix - weatherMix) * blend

      ctx.clearRect(0, 0, width, height)
      if (audioRef.current) {
        const targetGain = soundOnRef.current ? 0.045 * weatherMix : 0
        audioRef.current.gain.gain.setTargetAtTime(targetGain, audioRef.current.ctx.currentTime, 0.18)
      }

      if (weatherMix < 0.004 && !activeRef.current) {
        raf = requestAnimationFrame(draw)
        return
      }

      ctx.globalAlpha = weatherMix
      updateWeather(simTime)
      drawWater()

      // Rain slowly compacts and washes the whole snowpack, with impacts doing the local work.
      if (pitchWorld.drifts.length > 2) {
        const scaledDt = (dt / 16.67) * speed
        const meltRate = (0.0016 + intensity * 0.0026) * scaledDt * weatherMix
        const copy = pitchWorld.drifts.slice()

        for (let i = 1; i < pitchWorld.drifts.length - 1; i++) {
          const channelNoise = 0.72 + ((Math.sin(i * 1.73 + simTime * 0.00017) + 1) * 0.34)
          const exposure = 0.75 + Math.max(0, copy[i] - (copy[i - 1] + copy[i + 1]) * 0.5) * 0.045
          pitchWorld.drifts[i] = Math.max(0, pitchWorld.drifts[i] - meltRate * channelNoise * exposure)

          if (frame % 4 === 0) {
            const target = pitchWorld.drifts[i - 1] < pitchWorld.drifts[i + 1] ? i - 1 : i + 1
            const slope = pitchWorld.drifts[i] - pitchWorld.drifts[target]
            if (slope > 3.2) {
              const slump = Math.min(0.045 * speed, (slope - 3.2) * 0.012 * speed)
              pitchWorld.drifts[i] = Math.max(0, pitchWorld.drifts[i] - slump)
              pitchWorld.drifts[target] += slump * 0.42
            }
          }
        }
        pitchWorld.wetness = Math.min(1, pitchWorld.wetness + 0.00042 * scaledDt * weatherMix)
      }

      if (frame % 8 === 0 && pitchWorld.water.length > 2) {
        const snapshot = pitchWorld.water.slice()
        for (let i = 1; i < pitchWorld.water.length - 1; i++) {
          if (snapshot[i] < 0.08) continue
          const leftY = snowSurfaceYAtIndex(i - 1, height)
          const rightY = snowSurfaceYAtIndex(i + 1, height)
          const target = leftY >= rightY ? i - 1 : i + 1
          const currentY = snowSurfaceYAtIndex(i, height)
          const targetY = snowSurfaceYAtIndex(target, height)
          if (targetY >= currentY - 1.2) {
            const flow = Math.min(snapshot[i] * 0.035 * speed, 0.045)
            pitchWorld.water[i] = Math.max(0, pitchWorld.water[i] - flow)
            pitchWorld.water[target] = Math.min(9, pitchWorld.water[target] + flow * 0.92)
          }
        }
      }

      const stormWind = stormSignal.wind * stormSignal.mix
      for (let i = 0; i < drops.length; i++) {
        const drop = drops[i]
        drop.y += drop.speed * (dt / 16.67) * (0.78 + intensity * 0.42) * Math.max(0.7, Math.sqrt(speed))
        drop.x += stormWind * 0.34 * (dt / 16.67)

        if (drop.x < -30) drop.x = width + 20
        if (drop.x > width + 30) drop.x = -20

        tryExtinguishFirefly(drop, weatherMix)

        const surface = surfaceYAt(drop.x, width, height)
        if (drop.y + drop.length >= surface) {
          if (Math.random() < intensity * weatherMix * 0.96) impact(drop)
          drops[i] = makeDrop(false)
          continue
        }

        if (Math.random() < (0.34 + intensity * 0.48) * weatherMix) drawDrop(drop)
      }

      ripples = ripples.filter((ripple) => {
        ripple.age += dt
        const progress = ripple.age / ripple.life
        if (progress >= 1) return false

        const radius = ripple.maxRadius * Math.pow(progress, 0.72)
        const fade = Math.sin(progress * Math.PI) * (1 - progress * 0.35)
        ctx.beginPath()
        ctx.ellipse(ripple.x, ripple.y, radius, radius * 0.19, 0, 0, Math.PI * 2)
        ctx.strokeStyle = `rgba(190, 208, 220, ${ripple.alpha * fade})`
        ctx.lineWidth = 0.55
        ctx.stroke()

        if (progress > 0.18 && progress < 0.78) {
          ctx.beginPath()
          ctx.ellipse(ripple.x, ripple.y, radius * 0.58, radius * 0.10, 0, 0, Math.PI * 2)
          ctx.strokeStyle = `rgba(173, 194, 208, ${ripple.alpha * fade * 0.42})`
          ctx.lineWidth = 0.4
          ctx.stroke()
        }
        return true
      })

      splashes = splashes.filter((splash) => {
        splash.age += dt
        const progress = splash.age / splash.life
        if (progress >= 1) return false

        const fade = 1 - progress
        for (let arm = 0; arm < 3; arm++) {
          const offset = (arm - 1) * splash.size * 0.7
          const rise = Math.sin(progress * Math.PI) * splash.size * (1.5 + arm * 0.14)
          ctx.beginPath()
          ctx.moveTo(splash.x, splash.y)
          ctx.quadraticCurveTo(
            splash.x + offset * 0.45,
            splash.y - rise,
            splash.x + offset,
            splash.y - rise * 0.72
          )
          ctx.strokeStyle = `rgba(205, 219, 229, ${splash.alpha * fade})`
          ctx.lineWidth = 0.45
          ctx.stroke()
        }
        return true
      })

      ctx.globalAlpha = 1
      raf = requestAnimationFrame(draw)
    }

    resize()
    window.addEventListener('resize', resize)
    raf = requestAnimationFrame(draw)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
    }
  }, [speed])

  return <canvas className="scene-canvas" ref={canvasRef} aria-hidden="true" />
}



