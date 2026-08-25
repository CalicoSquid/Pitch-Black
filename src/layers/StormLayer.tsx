import { useEffect, useRef } from 'react'
import type { Scene } from '../types'
import { getPitchAudio, getPitchAudioOutput } from '../audio/pitchAudio'
import {
  ensureWorld,
  pitchWorld,
  stormSignal,
  surfaceYAt,
  worldIndexAt,
} from '../world/worldState'

export function StormLayer({
  active,
  scene,
  soundOn,
}: {
  active: boolean
  scene: Scene
  soundOn: boolean
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const activeRef = useRef(active)
  const sceneRef = useRef(scene)
  const soundOnRef = useRef(soundOn)
  const rumbleRef = useRef<{ ctx: AudioContext; gain: GainNode; source: AudioBufferSourceNode } | null>(null)

  useEffect(() => {
    activeRef.current = active
  }, [active])

  useEffect(() => {
    sceneRef.current = scene
  }, [scene])

  useEffect(() => {
    soundOnRef.current = soundOn
  }, [soundOn])

  useEffect(() => {
    if (!active || !soundOn) {
      const current = rumbleRef.current
      if (current) {
        current.gain.gain.setTargetAtTime(0, current.ctx.currentTime, 1.6)
        window.setTimeout(() => {
          try { current.source.stop() } catch { /* already stopped */ }
          if (rumbleRef.current === current) rumbleRef.current = null
        }, 4200)
      }
      return
    }

    const audioCtx = getPitchAudio()
    if (!audioCtx) return
    if (audioCtx.state === 'suspended') void audioCtx.resume()

    const seconds = 5
    const buffer = audioCtx.createBuffer(1, Math.floor(audioCtx.sampleRate * seconds), audioCtx.sampleRate)
    const data = buffer.getChannelData(0)
    let low = 0
    for (let i = 0; i < data.length; i++) {
      const white = Math.random() * 2 - 1
      low = low * 0.992 + white * 0.008
      data[i] = low * 0.78 + white * 0.012
    }

    const source = audioCtx.createBufferSource()
    const filter = audioCtx.createBiquadFilter()
    const gain = audioCtx.createGain()
    source.buffer = buffer
    source.loop = true
    filter.type = 'lowpass'
    filter.frequency.value = 190
    filter.Q.value = 0.45
    gain.gain.value = 0
    source.connect(filter).connect(gain).connect(getPitchAudioOutput(audioCtx))
    source.start()
    gain.gain.setTargetAtTime(0.024, audioCtx.currentTime, 2.8)
    rumbleRef.current = { ctx: audioCtx, gain, source }

    return () => {
      gain.gain.setTargetAtTime(0, audioCtx.currentTime, 1.2)
      window.setTimeout(() => {
        try { source.stop() } catch { /* already stopped */ }
      }, 3200)
      if (rumbleRef.current?.source === source) rumbleRef.current = null
    }
  }, [active, soundOn])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let width = window.innerWidth
    let height = window.innerHeight
    let dpr = Math.min(window.devicePixelRatio || 1, 1.25)
    let raf = 0
    let last = performance.now()
    let lastCloudFrame = 0
    let stormMix = activeRef.current ? 1 : 0
    let frontProgress = activeRef.current ? 1 : 0
    let frontDirection: 1 | -1 = Math.random() > 0.5 ? 1 : -1
    let wasActive = activeRef.current
    let cloudOffset = 0
    let gust = 0
    let gustTarget = 0
    let nextGust = performance.now() + 4200
    let nextStrike = performance.now() + 7000 + Math.random() * 9000
    let nextDistantThunder = performance.now() + 6500 + Math.random() * 6500
    let flashStarted = -1
    let boltUntil = -1
    let bolt: Array<{ x: number; y: number }> = []

    const resize = () => {
      width = window.innerWidth
      height = window.innerHeight
      dpr = Math.min(window.devicePixelRatio || 1, 1.25)
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ensureWorld(width, height)
    }

    const thunder = (strength: number) => {
      if (!soundOnRef.current) return
      const audioCtx = getPitchAudio()
      if (!audioCtx) return
      if (audioCtx.state === 'suspended') void audioCtx.resume()

      const delay = 0.32 + Math.random() * 0.72
      const duration = 2.2
      const buffer = audioCtx.createBuffer(1, Math.floor(audioCtx.sampleRate * duration), audioCtx.sampleRate)
      const data = buffer.getChannelData(0)
      let low = 0

      for (let i = 0; i < data.length; i++) {
        const white = Math.random() * 2 - 1
        low = low * 0.987 + white * 0.013
        const seconds = i / audioCtx.sampleRate
        const envelope = Math.exp(-seconds / 0.82)
        const roll = 0.72 + Math.sin(seconds * 23) * 0.12
        data[i] = low * envelope * roll * (0.42 + strength * 0.18)
      }

      const source = audioCtx.createBufferSource()
      const filter = audioCtx.createBiquadFilter()
      const gain = audioCtx.createGain()
      source.buffer = buffer
      filter.type = 'lowpass'
      filter.frequency.value = 250
      gain.gain.value = 0.115
      source.connect(filter).connect(gain).connect(getPitchAudioOutput(audioCtx))
      source.start(audioCtx.currentTime + delay)
    }

    const distantThunder = () => {
      if (!soundOnRef.current) return
      const audioCtx = getPitchAudio()
      if (!audioCtx) return
      if (audioCtx.state === 'suspended') void audioCtx.resume()

      const duration = 3.4
      const buffer = audioCtx.createBuffer(1, Math.floor(audioCtx.sampleRate * duration), audioCtx.sampleRate)
      const data = buffer.getChannelData(0)
      let low = 0

      for (let i = 0; i < data.length; i++) {
        const white = Math.random() * 2 - 1
        low = low * 0.991 + white * 0.009
        const seconds = i / audioCtx.sampleRate
        const attack = Math.min(1, seconds / 0.34)
        const decay = Math.exp(-seconds / 1.45)
        const roll = 0.78 + Math.sin(seconds * 13.5) * 0.10 + Math.sin(seconds * 5.2) * 0.08
        data[i] = low * attack * decay * roll * 0.52
      }

      const source = audioCtx.createBufferSource()
      const filter = audioCtx.createBiquadFilter()
      const gain = audioCtx.createGain()
      source.buffer = buffer
      filter.type = 'lowpass'
      filter.frequency.value = 165
      filter.Q.value = 0.35
      gain.gain.value = 0.052
      source.connect(filter).connect(gain).connect(getPitchAudioOutput(audioCtx))
      source.start(audioCtx.currentTime + 0.18 + Math.random() * 0.35)
    }

    const strikeWorld = (x: number, strength: number) => {
      const idx = worldIndexAt(x, width)

      if (sceneRef.current === 'snow') {
        for (let offset = -4; offset <= 4; offset++) {
          const i = idx + offset
          if (i <= 1 || i >= pitchWorld.drifts.length - 2) continue
          const falloff = Math.max(0, 1 - Math.abs(offset) / 5)
          const melted = Math.min(pitchWorld.drifts[i], 1.5 * falloff * strength)
          pitchWorld.drifts[i] -= melted
          pitchWorld.water[i] = Math.min(9, pitchWorld.water[i] + melted * 0.12)
        }
      }

      if (sceneRef.current === 'ember') {
        for (let offset = -3; offset <= 3; offset++) {
          const i = idx + offset
          if (i <= 1 || i >= pitchWorld.ember.length - 2) continue
          const falloff = Math.max(0, 1 - Math.abs(offset) / 4)
          pitchWorld.ember[i] = Math.max(pitchWorld.ember[i], (0.70 + strength * 0.18) * falloff)
          pitchWorld.char[i] = Math.max(pitchWorld.char[i], 0.08 * falloff)
        }
      }
    }

    const strike = (time: number) => {
      const targetX = width * (0.14 + Math.random() * 0.72)
      const targetY = surfaceYAt(targetX, width, height)
      const strength = 0.72 + Math.random() * 0.28
      const startX = targetX + (Math.random() - 0.5) * width * 0.16
      const segments = 8

      bolt = [{ x: startX, y: -12 }]
      for (let i = 1; i < segments; i++) {
        const t = i / segments
        bolt.push({
          x: startX * (1 - t) + targetX * t + (Math.random() - 0.5) * 34 * (1 - t),
          y: targetY * t,
        })
      }
      bolt.push({ x: targetX, y: targetY })

      flashStarted = time
      boltUntil = time + 185
      strikeWorld(targetX, strength)
      thunder(strength)
    }

    const drawCloudBand = (band: number, time: number) => {
      const spacing = Math.max(92, width / 9)
      const offset = cloudOffset * (0.46 + band * 0.10)
      const top = height * (0.025 + band * 0.092)
      const baseThickness = height * (0.115 + band * 0.019)

      ctx.beginPath()
      ctx.moveTo(-spacing * 2 + offset, top)
      for (let x = -spacing * 2; x <= width + spacing * 2; x += spacing * 0.72) {
        const wave =
          Math.sin(x * 0.0053 + band * 1.37 + time * 0.000075) * 15 +
          Math.sin(x * 0.0127 + band * 0.71 - time * 0.000041) * 7 +
          Math.sin(x * 0.024 + band * 2.11) * 3.5
        ctx.lineTo(x + offset, top + wave)
      }

      for (let x = width + spacing * 2; x >= -spacing * 2; x -= spacing * 0.72) {
        const thickness =
          baseThickness +
          Math.sin(x * 0.0047 + band * 1.9) * 16 +
          Math.sin(x * 0.015 + band * 0.63 + time * 0.000047) * 6
        const lowerWave =
          Math.sin(x * 0.0061 + band * 0.91 + time * 0.000058 + 1.6) * 16 +
          Math.sin(x * 0.018 + band * 1.17) * 5
        ctx.lineTo(x + offset, top + thickness + lowerWave)
      }

      ctx.closePath()
      const bodyAlpha = (0.078 + band * 0.013) * stormMix
      ctx.fillStyle = `rgba(39, 44, 49, ${bodyAlpha})`
      ctx.fill()

      ctx.strokeStyle = `rgba(111, 119, 126, ${(0.018 + band * 0.004) * stormMix})`
      ctx.lineWidth = 0.55
      ctx.stroke()
    }

    const drawScud = (time: number) => {
      for (let i = 0; i < 11; i++) {
        const seedA = Math.sin(i * 91.73 + 14.2) * 43758.5453
        const seedB = Math.sin(i * 47.17 + 8.6) * 24634.6345
        const fracA = seedA - Math.floor(seedA)
        const fracB = seedB - Math.floor(seedB)

        const travel = cloudOffset * (0.62 + fracA * 0.34)
        const wrap = width + 360
        const x = ((fracA * wrap + travel + i * 137) % wrap + wrap) % wrap - 180
        const y = height * (0.13 + fracB * 0.37) +
          Math.sin(time * 0.00016 + i * 1.31) * (7 + fracA * 8)
        const w = 88 + fracA * 135
        const h = 15 + fracB * 30
        const wobble = Math.sin(time * 0.00011 + i * 2.07) * 12

        ctx.beginPath()
        ctx.ellipse(x, y, w * 0.54, h, wobble * 0.002, 0, Math.PI * 2)
        ctx.ellipse(x - w * 0.27, y + h * 0.12, w * 0.31, h * 0.72, 0, 0, Math.PI * 2)
        ctx.ellipse(x + w * 0.30, y - h * 0.08, w * 0.35, h * 0.78, 0, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(55, 61, 67, ${(0.052 + fracB * 0.030) * stormMix})`
        ctx.fill()

        // Dark cores are what let a cloud genuinely obscure part of the moon
        // when it happens to cross that part of the sky.
        ctx.beginPath()
        ctx.ellipse(x + w * 0.04, y + h * 0.18, w * 0.42, h * 0.62, 0, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(0, 0, 0, ${(0.16 + fracA * 0.11) * stormMix})`
        ctx.fill()
      }
    }

    const clipStormFront = () => {
      const skyBottom = height * 0.68
      const baseEdge = frontDirection > 0
        ? width * Math.min(1.08, frontProgress * 1.12)
        : width * (1 - Math.min(1.08, frontProgress * 1.12))

      ctx.beginPath()
      if (frontDirection > 0) {
        ctx.moveTo(0, 0)
        ctx.lineTo(baseEdge + 30, 0)
        for (let y = 0; y <= skyBottom; y += Math.max(42, height * 0.065)) {
          const ragged = Math.sin(y * 0.027 + cloudOffset * 0.011) * 52 +
            Math.sin(y * 0.061 + 1.3) * 21
          ctx.lineTo(baseEdge + ragged, y)
        }
        ctx.lineTo(0, skyBottom)
      } else {
        ctx.moveTo(width, 0)
        ctx.lineTo(baseEdge - 30, 0)
        for (let y = 0; y <= skyBottom; y += Math.max(42, height * 0.065)) {
          const ragged = Math.sin(y * 0.027 + cloudOffset * 0.011) * 52 +
            Math.sin(y * 0.061 + 1.3) * 21
          ctx.lineTo(baseEdge - ragged, y)
        }
        ctx.lineTo(width, skyBottom)
      }
      ctx.closePath()
      ctx.clip()
    }

    const draw = (time: number) => {
      raf = requestAnimationFrame(draw)

      const dt = Math.min(50, time - last)
      last = time

      const target = activeRef.current ? 1 : 0
      const tau = target > stormMix ? 2700 : 2200
      const blend = 1 - Math.exp(-dt / tau)
      stormMix += (target - stormMix) * blend

      if (activeRef.current && !wasActive) {
        frontDirection = Math.random() > 0.5 ? 1 : -1
      }
      wasActive = activeRef.current

      if (activeRef.current) {
        frontProgress = Math.min(1, frontProgress + dt / 8200)
      } else {
        frontProgress = Math.max(0, frontProgress - dt / 6200)
      }

      if (time > nextGust) {
        gustTarget = (Math.random() > 0.5 ? 1 : -1) * (0.72 + Math.random() * 0.78)
        nextGust = time + 4200 + Math.random() * 7200
      }
      gust += (gustTarget - gust) * (1 - Math.exp(-dt / 1450))
      cloudOffset += gust * dt * 0.016

      stormSignal.mix = stormMix
      stormSignal.wind = gust
      pitchWorld.cloudCover += ((0.12 + stormMix * 0.80) - pitchWorld.cloudCover) * (1 - Math.exp(-dt / 1800))

      if (activeRef.current && stormMix > 0.62 && time >= nextStrike) {
        strike(time)
        nextStrike = time + 12000 + Math.random() * 18000
      }

      if (activeRef.current && stormMix > 0.34 && time >= nextDistantThunder) {
        distantThunder()
        nextDistantThunder = time + 8500 + Math.random() * 9000
      }

      if (!activeRef.current && stormMix < 0.08) {
        nextStrike = time + 7000 + Math.random() * 9000
        nextDistantThunder = time + 6500 + Math.random() * 6500
      }

      // Clouds are deliberately capped near 24fps; they move slowly and should
      // never steal frame budget from falling snow/rain/fire.
      if (time - lastCloudFrame < 40 && time > boltUntil) return
      lastCloudFrame = time

      ctx.clearRect(0, 0, width, height)
      if (stormMix < 0.003 && time > boltUntil) {
        stormSignal.flash = 0
        return
      }

      // A very small global hush arrives first; the deeper darkness follows
      // the ragged storm front as it physically crosses the sky.
      ctx.fillStyle = `rgba(0, 0, 0, ${0.045 * stormMix})`
      ctx.fillRect(0, 0, width, height)

      ctx.save()
      clipStormFront()
      ctx.fillStyle = `rgba(0, 0, 0, ${0.17 * stormMix})`
      ctx.fillRect(0, 0, width, height * 0.70)
      for (let band = 0; band < 5; band++) drawCloudBand(band, time)
      drawScud(time)
      ctx.restore()

      let flash = 0
      if (flashStarted >= 0) {
        const age = time - flashStarted
        if (age < 145) {
          flash = Math.max(0, 1 - age / 145)
          ctx.fillStyle = `rgba(205, 218, 229, ${0.105 * flash * stormMix})`
          ctx.fillRect(0, 0, width, height)
        }
      }
      stormSignal.flash = flash * stormMix

      if (time < boltUntil && bolt.length > 1) {
        const fade = Math.max(0, (boltUntil - time) / 185) * stormMix
        ctx.beginPath()
        ctx.moveTo(bolt[0].x, bolt[0].y)
        for (let i = 1; i < bolt.length; i++) ctx.lineTo(bolt[i].x, bolt[i].y)
        ctx.strokeStyle = `rgba(225, 234, 240, ${0.46 * fade})`
        ctx.lineWidth = 0.65
        ctx.stroke()
      }
    }

    resize()
    window.addEventListener('resize', resize)
    raf = requestAnimationFrame(draw)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
      stormSignal.mix = 0
      stormSignal.wind = 0
      stormSignal.flash = 0
    }
  }, [])

  return <canvas className="scene-canvas storm-layer-canvas" ref={canvasRef} aria-hidden="true" />
}


