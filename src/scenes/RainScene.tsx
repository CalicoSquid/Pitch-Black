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
  slantBias: number
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
    let driftSnapshot = new Float32Array(pitchWorld.drifts.length)
    let waterSnapshot = new Float32Array(pitchWorld.water.length)
    let idleCleared = false
    let lastAudioGainNode: GainNode | null = null
    let lastAudioTargetGain = Number.NaN
    let intensity = 0.72
    let targetIntensity = 0.72
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
      const y = surfaceYAt(drop.x, width, height)

      if (snowDepth > 1.2) {
        const melt = (0.415 + drop.speed * 0.0317) * Math.max(1, speed * 0.78)
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

      const pooled = Math.min(1, pitchWorld.water[idx] / 2.4)
      const exposedGround = Math.max(0, 1 - remainingSnow / 7)
      const watery = Math.min(1, 0.05 + pooled * 0.82 + exposedGround * 0.42)
      const rippleChance = 0.08 + watery * 0.84
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

      if (Math.random() < 0.42 + watery * 0.42) {
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

    const drawWater = () => {
      // The old bottom-of-screen water strip is intentionally gone.
      // Persistent pools are now rendered against the raised terrain surface.
    }

    const drawDrop = (drop: RainDrop, curtainLift: number, ambientGust: number) => {
      const stormWind = stormSignal.wind * stormSignal.mix
      const slant = drop.length * (0.08 + drop.slantBias + ambientGust * 0.04 + stormWind * 0.10)
      const rainAlpha = Math.min(0.56, drop.alpha * (0.72 + intensity * 0.38) * curtainLift)
      ctx.beginPath()
      ctx.moveTo(drop.x, drop.y)
      ctx.lineTo(drop.x - slant, drop.y + drop.length)
      ctx.strokeStyle = `rgba(196, 213, 226, ${rainAlpha})`
      ctx.lineWidth = drop.width
      ctx.lineCap = 'round'
      ctx.stroke()
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

      const currentAudio = audioRef.current
      if (currentAudio) {
        const targetGain = soundOnRef.current ? 0.045 * weatherMix : 0
        if (currentAudio.gain !== lastAudioGainNode) {
          lastAudioGainNode = currentAudio.gain
          lastAudioTargetGain = Number.NaN
        }
        if (targetGain !== lastAudioTargetGain) {
          currentAudio.gain.gain.setTargetAtTime(targetGain, currentAudio.ctx.currentTime, 0.18)
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
      ctx.globalAlpha = weatherMix
      updateWeather(simTime)
      drawWater()

      // Rain slowly compacts and washes the whole snowpack, with impacts doing the local work.
      if (pitchWorld.drifts.length > 2) {
        const scaledDt = (dt / 16.67) * speed
        const meltRate = (0.00195 + intensity * 0.00317) * scaledDt * weatherMix
        driftSnapshot.set(pitchWorld.drifts)
        const copy = driftSnapshot

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
            const flow = Math.min(snapshot[i] * 0.035 * speed, 0.045)
            pitchWorld.water[i] = Math.max(0, pitchWorld.water[i] - flow)
            pitchWorld.water[target] = Math.min(9, pitchWorld.water[target] + flow * 0.92)
          }
        }
      }

      const stormWind = stormSignal.wind * stormSignal.mix
      const ambientGust = ambientGustAt(time)
      for (let i = 0; i < drops.length; i++) {
        const drop = drops[i]
        drop.y += drop.speed * (dt / 16.67) * (0.78 + intensity * 0.42) * Math.max(0.7, Math.sqrt(speed))
        drop.x += (stormWind * 0.34 + ambientGust * 0.08) * (dt / 16.67)

        if (drop.x < -30) drop.x = width + 20
        if (drop.x > width + 30) drop.x = -20

        tryExtinguishFirefly(drop, weatherMix, ambientGust)

        const surface = surfaceYAt(drop.x, width, height)
        if (drop.y + drop.length >= surface) {
          if (Math.random() < intensity * weatherMix * 0.96) impact(drop)
          drops[i] = makeDrop(false)
          continue
        }

        drawDrop(drop, curtainLiftAt(drop.x, time), ambientGust)
      }

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



