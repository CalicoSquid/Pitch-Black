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

type CloudBank = {
  anchorX: number
  anchorY: number
  scale: number
  speed: number
  spread: number
  puffCount: number
  seedA: number
  seedB: number
  seedC: number
}

function seededFrac(seed: number) {
  const n = Math.sin(seed * 127.1 + 311.7) * 43758.5453123
  return n - Math.floor(n)
}

function wrapValue(value: number, span: number) {
  return ((value % span) + span) % span
}

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
  const rumbleRef = useRef<{
    ctx: AudioContext
    deepGain: GainNode
    textureGain: GainNode
    deepSource: AudioBufferSourceNode
    textureSource: AudioBufferSourceNode
  } | null>(null)
  const thunderBankRef = useRef<{
    ctx: AudioContext
    distant: AudioBuffer[]
    strike: AudioBuffer[]
  } | null>(null)

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
        current.deepGain.gain.setTargetAtTime(0, current.ctx.currentTime, 1.8)
        current.textureGain.gain.setTargetAtTime(0, current.ctx.currentTime, 1.4)
        window.setTimeout(() => {
          try { current.deepSource.stop() } catch { /* already stopped */ }
          try { current.textureSource.stop() } catch { /* already stopped */ }
          if (rumbleRef.current === current) rumbleRef.current = null
        }, 4600)
      }
      return
    }

    const audioCtx = getPitchAudio()
    if (!audioCtx) return
    if (audioCtx.state === 'suspended') void audioCtx.resume()

    const seconds = 6
    const deepBuffer = audioCtx.createBuffer(1, Math.floor(audioCtx.sampleRate * seconds), audioCtx.sampleRate)
    const deepData = deepBuffer.getChannelData(0)
    let deepLow = 0
    let deepSlow = 0
    for (let i = 0; i < deepData.length; i++) {
      const white = Math.random() * 2 - 1
      deepLow = deepLow * 0.994 + white * 0.006
      deepSlow = deepSlow * 0.9992 + deepLow * 0.0008
      deepData[i] = deepLow * 0.64 + deepSlow * 0.50
    }

    const textureBuffer = audioCtx.createBuffer(1, Math.floor(audioCtx.sampleRate * seconds), audioCtx.sampleRate)
    const textureData = textureBuffer.getChannelData(0)
    let textureLow = 0
    for (let i = 0; i < textureData.length; i++) {
      const white = Math.random() * 2 - 1
      textureLow = textureLow * 0.978 + white * 0.022
      const secondsAtSample = i / audioCtx.sampleRate
      const swell = 0.72 + Math.sin(secondsAtSample * 1.7) * 0.12 + Math.sin(secondsAtSample * 0.63 + 1.4) * 0.10
      textureData[i] = textureLow * swell * 0.52
    }

    const deepSource = audioCtx.createBufferSource()
    const deepFilter = audioCtx.createBiquadFilter()
    const deepGain = audioCtx.createGain()
    deepSource.buffer = deepBuffer
    deepSource.loop = true
    deepFilter.type = 'lowpass'
    deepFilter.frequency.value = 145
    deepFilter.Q.value = 0.42
    deepGain.gain.value = 0
    deepSource.connect(deepFilter).connect(deepGain).connect(getPitchAudioOutput(audioCtx))

    const textureSource = audioCtx.createBufferSource()
    const textureFilter = audioCtx.createBiquadFilter()
    const textureGain = audioCtx.createGain()
    textureSource.buffer = textureBuffer
    textureSource.loop = true
    textureFilter.type = 'lowpass'
    textureFilter.frequency.value = 420
    textureFilter.Q.value = 0.30
    textureGain.gain.value = 0
    textureSource.connect(textureFilter).connect(textureGain).connect(getPitchAudioOutput(audioCtx))

    deepSource.start()
    textureSource.start(audioCtx.currentTime + 0.37)
    deepGain.gain.setTargetAtTime(0.019, audioCtx.currentTime, 3.1)
    textureGain.gain.setTargetAtTime(0.0045, audioCtx.currentTime, 3.5)
    rumbleRef.current = { ctx: audioCtx, deepGain, textureGain, deepSource, textureSource }

    return () => {
      deepGain.gain.setTargetAtTime(0, audioCtx.currentTime, 1.4)
      textureGain.gain.setTargetAtTime(0, audioCtx.currentTime, 1.2)
      window.setTimeout(() => {
        try { deepSource.stop() } catch { /* already stopped */ }
        try { textureSource.stop() } catch { /* already stopped */ }
      }, 3600)
      if (rumbleRef.current?.deepSource === deepSource) rumbleRef.current = null
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
    let nextDistantThunder = performance.now() + 4200 + Math.random() * 5200
    let flashStarted = -1
    let boltUntil = -1
    let bolt: Array<{ x: number; y: number }> = []
    let canvasCleared = false
    let deepIdle = !activeRef.current && stormMix < 0.08
    let lastRumbleUpdate = 0
    let lastDeepRumbleTarget = Number.NaN
    let lastTextureRumbleTarget = Number.NaN
    let farBanks: CloudBank[] = []
    let mainBanks: CloudBank[] = []
    let scudBanks: CloudBank[] = []

    const createBanks = (count: number, layer: 'far' | 'main' | 'scud') => {
      const banks: CloudBank[] = []
      for (let i = 0; i < count; i++) {
        const a = seededFrac(i * 1.31 + (layer === 'far' ? 3.2 : layer === 'main' ? 9.7 : 17.1))
        const b = seededFrac(i * 2.11 + (layer === 'far' ? 5.1 : layer === 'main' ? 11.9 : 23.4))
        const c = seededFrac(i * 3.07 + (layer === 'far' ? 7.6 : layer === 'main' ? 15.8 : 27.8))
        if (layer === 'far') {
          banks.push({
            anchorX: a,
            anchorY: 0.03 + b * 0.16,
            scale: 0.95 + c * 0.55,
            speed: 0.20 + a * 0.14,
            spread: 220 + b * 210,
            puffCount: 6 + Math.floor(c * 3),
            seedA: a,
            seedB: b,
            seedC: c,
          })
        } else if (layer === 'main') {
          banks.push({
            anchorX: a,
            anchorY: 0.10 + b * 0.26,
            scale: 0.88 + c * 0.62,
            speed: 0.30 + a * 0.20,
            spread: 170 + b * 185,
            puffCount: 7 + Math.floor(c * 4),
            seedA: a,
            seedB: b,
            seedC: c,
          })
        } else {
          banks.push({
            anchorX: a,
            anchorY: 0.14 + b * 0.34,
            scale: 0.72 + c * 0.55,
            speed: 0.50 + a * 0.34,
            spread: 95 + b * 120,
            puffCount: 4 + Math.floor(c * 3),
            seedA: a,
            seedB: b,
            seedC: c,
          })
        }
      }
      return banks
    }

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
      farBanks = createBanks(Math.max(4, Math.min(6, Math.round(width / 430))), 'far')
      mainBanks = createBanks(Math.max(6, Math.min(9, Math.round(width / 260))), 'main')
      scudBanks = createBanks(Math.max(8, Math.min(12, Math.round(width / 180))), 'scud')
    }

    const buildThunderBuffer = (audioCtx: AudioContext, duration: number, strikeStyle: boolean, variation: number) => {
      const buffer = audioCtx.createBuffer(1, Math.floor(audioCtx.sampleRate * duration), audioCtx.sampleRate)
      const data = buffer.getChannelData(0)
      let low = 0
      let body = 0
      let slow = 0

      for (let i = 0; i < data.length; i++) {
        const white = Math.random() * 2 - 1
        low = low * (strikeStyle ? 0.984 : 0.990) + white * (strikeStyle ? 0.016 : 0.010)
        body = body * 0.995 + low * 0.005
        slow = slow * 0.999 + body * 0.001
        const secondsAtSample = i / audioCtx.sampleRate
        const attack = Math.min(1, secondsAtSample / (strikeStyle ? 0.13 : 0.44))
        const decay = Math.exp(-secondsAtSample / (strikeStyle ? 1.85 + variation * 0.30 : 2.55 + variation * 0.45))
        const rolling = 0.74 + Math.sin(secondsAtSample * (9.5 + variation * 2.3)) * 0.11 + Math.sin(secondsAtSample * (3.3 + variation)) * 0.09
        const distantPulse = strikeStyle ? 1 : 0.90 + Math.sin(secondsAtSample * 1.25 + variation * 3.1) * 0.10
        data[i] = (low * 0.30 + body * 0.64 + slow * 0.34) * attack * decay * rolling * distantPulse
      }
      return buffer
    }

    const getThunderBank = (audioCtx: AudioContext) => {
      const current = thunderBankRef.current
      if (current?.ctx === audioCtx) return current

      const bank = {
        ctx: audioCtx,
        distant: [
          buildThunderBuffer(audioCtx, 5.0, false, 0.18),
          buildThunderBuffer(audioCtx, 5.8, false, 0.72),
        ],
        strike: [
          buildThunderBuffer(audioCtx, 4.2, true, 0.24),
          buildThunderBuffer(audioCtx, 4.8, true, 0.81),
        ],
      }
      thunderBankRef.current = bank
      return bank
    }

    const playThunderBuffer = (
      audioCtx: AudioContext,
      buffer: AudioBuffer,
      delay: number,
      bodyGainValue: number,
      textureGainValue: number,
      rate: number,
      bodyCutoff: number,
    ) => {
      const startTime = audioCtx.currentTime + delay

      const bodySource = audioCtx.createBufferSource()
      const bodyFilter = audioCtx.createBiquadFilter()
      const bodyGain = audioCtx.createGain()
      bodySource.buffer = buffer
      bodySource.playbackRate.value = rate
      bodyFilter.type = 'lowpass'
      bodyFilter.frequency.value = bodyCutoff
      bodyFilter.Q.value = 0.42
      bodyGain.gain.value = bodyGainValue
      bodySource.connect(bodyFilter).connect(bodyGain).connect(getPitchAudioOutput(audioCtx))
      bodySource.start(startTime)

      const textureSource = audioCtx.createBufferSource()
      const textureFilter = audioCtx.createBiquadFilter()
      const textureGain = audioCtx.createGain()
      textureSource.buffer = buffer
      textureSource.playbackRate.value = rate * (0.985 + Math.random() * 0.025)
      textureFilter.type = 'bandpass'
      textureFilter.frequency.value = 520 + Math.random() * 210
      textureFilter.Q.value = 0.52
      textureGain.gain.value = textureGainValue
      textureSource.connect(textureFilter).connect(textureGain).connect(getPitchAudioOutput(audioCtx))
      textureSource.start(startTime + 0.035 + Math.random() * 0.055)
    }

    const thunder = (strength: number) => {
      if (!soundOnRef.current) return
      const audioCtx = getPitchAudio()
      if (!audioCtx) return
      if (audioCtx.state === 'suspended') void audioCtx.resume()

      const bank = getThunderBank(audioCtx)
      const buffer = bank.strike[Math.random() < 0.5 ? 0 : 1]
      const delay = 0.42 + Math.random() * 0.92
      const rate = 0.94 + Math.random() * 0.10
      playThunderBuffer(
        audioCtx,
        buffer,
        delay,
        0.092 + strength * 0.028,
        0.018 + strength * 0.010,
        rate,
        235 + strength * 55,
      )

      if (strength > 0.87 && Math.random() < 0.34) {
        const tailBuffer = bank.distant[Math.random() < 0.5 ? 0 : 1]
        playThunderBuffer(
          audioCtx,
          tailBuffer,
          delay + 1.55 + Math.random() * 0.75,
          0.026 + strength * 0.012,
          0.006,
          0.90 + Math.random() * 0.08,
          180,
        )
      }
    }

    const distantThunder = () => {
      if (!soundOnRef.current) return
      const audioCtx = getPitchAudio()
      if (!audioCtx) return
      if (audioCtx.state === 'suspended') void audioCtx.resume()

      const bank = getThunderBank(audioCtx)
      const buffer = bank.distant[Math.random() < 0.5 ? 0 : 1]
      const strength = 0.72 + Math.random() * 0.28
      playThunderBuffer(
        audioCtx,
        buffer,
        0.12 + Math.random() * 0.42,
        0.032 + strength * 0.018,
        0.006 + strength * 0.006,
        0.90 + Math.random() * 0.14,
        150 + Math.random() * 45,
      )

      if (Math.random() < 0.24) {
        const answerBuffer = bank.distant[Math.random() < 0.5 ? 0 : 1]
        playThunderBuffer(
          audioCtx,
          answerBuffer,
          2.0 + Math.random() * 2.2,
          0.020 + Math.random() * 0.015,
          0.004 + Math.random() * 0.004,
          0.88 + Math.random() * 0.12,
          145 + Math.random() * 35,
        )
      }
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

    const drawCloudBank = (
      bank: CloudBank,
      layer: 'far' | 'main' | 'scud',
      time: number,
      flash: number,
      moonOcclusion = false,
    ) => {
      const travelSpeed = layer === 'far' ? 0.0023 : layer === 'main' ? 0.0041 : 0.0072
      const windWeight = layer === 'far' ? 0.55 : layer === 'main' ? 0.90 : 1.35
      const wrap = width + bank.spread * 3
      const travel = time * travelSpeed * frontDirection * (0.70 + bank.speed * 0.85) + cloudOffset * windWeight * (0.70 + bank.speed)
      const x = wrapValue(bank.anchorX * wrap + travel + bank.seedB * width * 0.22, wrap) - bank.spread * 1.5
      const y = height * bank.anchorY + Math.sin(time * 0.000045 * (1 + bank.seedA * 0.7) + bank.seedB * 6.28) * (layer === 'scud' ? 6 + bank.seedC * 6 : layer === 'main' ? 2.8 + bank.seedC * 2.4 : 1.8 + bank.seedC * 1.4)
      const puffSpread = bank.spread
      const baseRx = layer === 'far' ? 112 * bank.scale : layer === 'main' ? 84 * bank.scale : 42 * bank.scale
      const baseRy = layer === 'far' ? 32 * bank.scale : layer === 'main' ? 36 * bank.scale : 14 * bank.scale
      const highlightAlpha = moonOcclusion
        ? 0
        : ((layer === 'far' ? 0.016 : layer === 'main' ? 0.022 : 0.018) + flash * (layer === 'main' ? 0.060 : 0.042)) * stormMix
      const bodyAlpha = moonOcclusion
        ? (layer === 'main' ? 0.19 : 0.15) * stormMix
        : ((layer === 'far' ? 0.110 : layer === 'main' ? 0.128 : 0.092) + flash * (layer === 'main' ? 0.045 : 0.025)) * stormMix
      const underAlpha = moonOcclusion
        ? (layer === 'main' ? 0.24 : 0.20) * stormMix
        : ((layer === 'far' ? 0.092 : layer === 'main' ? 0.118 : 0.102) + flash * (layer === 'main' ? 0.030 : 0.016)) * stormMix
      const coreAlpha = moonOcclusion
        ? (layer === 'main' ? 0.34 : 0.38) * stormMix
        : ((layer === 'far' ? 0.145 : layer === 'main' ? 0.182 : 0.195) + flash * 0.030) * stormMix

      ctx.beginPath()
      for (let i = 0; i < bank.puffCount; i++) {
        const frac = bank.puffCount > 1 ? i / (bank.puffCount - 1) : 0.5
        const local = seededFrac(bank.seedA * 19.1 + bank.seedB * 7.3 + i * 2.07)
        const localB = seededFrac(bank.seedC * 13.7 + i * 3.11)
        const rx = baseRx * (0.72 + local * 0.55)
        const ry = baseRy * (0.74 + localB * 0.42)
        const px = x + (frac - 0.5) * puffSpread * (0.88 + localB * 0.24)
        const py = y - ry * (0.20 + local * 0.08) + Math.sin(time * 0.00006 + i * 0.9 + bank.seedC * 4) * (layer === 'scud' ? 2.2 : 1.2)
        ctx.ellipse(px, py, rx * 0.82, ry * 0.58, (local - 0.5) * 0.18, 0, Math.PI * 2)
      }
      if (highlightAlpha > 0) {
        ctx.fillStyle = `rgba(76, 83, 91, ${highlightAlpha})`
        ctx.fill()
      }

      ctx.beginPath()
      for (let i = 0; i < bank.puffCount; i++) {
        const frac = bank.puffCount > 1 ? i / (bank.puffCount - 1) : 0.5
        const local = seededFrac(bank.seedA * 29.1 + bank.seedB * 11.3 + i * 2.37)
        const localB = seededFrac(bank.seedC * 17.7 + i * 4.11)
        const rx = baseRx * (0.76 + local * 0.60)
        const ry = baseRy * (0.82 + localB * 0.46)
        const px = x + (frac - 0.5) * puffSpread * (0.92 + localB * 0.18)
        const py = y + Math.sin(time * 0.00005 + i * 0.7 + bank.seedB * 5.7) * (layer === 'scud' ? 2.4 : 1.3)
        ctx.ellipse(px, py, rx, ry, (localB - 0.5) * 0.10, 0, Math.PI * 2)
      }
      ctx.fillStyle = moonOcclusion
        ? `rgba(0, 0, 0, ${bodyAlpha})`
        : `rgba(24, 28, 33, ${bodyAlpha})`
      ctx.fill()

      ctx.beginPath()
      for (let i = 0; i < bank.puffCount; i++) {
        const frac = bank.puffCount > 1 ? i / (bank.puffCount - 1) : 0.5
        const local = seededFrac(bank.seedA * 37.7 + bank.seedB * 9.1 + i * 1.83)
        const localB = seededFrac(bank.seedC * 23.2 + i * 2.71)
        const rx = baseRx * (0.60 + local * 0.48)
        const ry = baseRy * (0.58 + localB * 0.34)
        const px = x + (frac - 0.5) * puffSpread * (0.84 + local * 0.20)
        const py = y + ry * (0.38 + localB * 0.16)
        ctx.ellipse(px, py, rx, ry, 0, 0, Math.PI * 2)
      }
      ctx.fillStyle = moonOcclusion
        ? `rgba(0, 0, 0, ${underAlpha})`
        : `rgba(8, 10, 12, ${underAlpha})`
      ctx.fill()

      ctx.beginPath()
      const coreCount = Math.max(2, bank.puffCount - (layer === 'scud' ? 2 : 3))
      for (let i = 0; i < coreCount; i++) {
        const frac = coreCount > 1 ? i / (coreCount - 1) : 0.5
        const local = seededFrac(bank.seedA * 41.7 + bank.seedB * 13.1 + i * 2.57)
        const localB = seededFrac(bank.seedC * 27.2 + i * 3.21)
        const rx = baseRx * (0.34 + local * 0.34)
        const ry = baseRy * (0.30 + localB * 0.24)
        const px = x + (frac - 0.5) * puffSpread * (0.70 + localB * 0.14)
        const py = y + ry * (0.64 + local * 0.18)
        ctx.ellipse(px, py, rx, ry, 0, 0, Math.PI * 2)
      }
      ctx.fillStyle = `rgba(0, 0, 0, ${coreAlpha})`
      ctx.fill()
    }

    const drawMoonOcclusion = (time: number) => {
      if (stormMix < 0.08) return

      const moonDisplaySize = Math.min(238, Math.max(128, width * 0.21))
      const moonRadius = moonDisplaySize * 0.49
      const moonX = width * 0.5
      const moonY = height * (width <= 620 ? 0.39 : 0.42)

      ctx.save()
      ctx.beginPath()
      ctx.arc(moonX, moonY, moonRadius, 0, Math.PI * 2)
      ctx.clip()

      // Reuse the real moving cloud geometry as a denser pass only across the
      // lunar disc. This lets thick banks genuinely swallow the moon while
      // thinner gaps still reveal it, without a scripted moon fade.
      for (let i = 0; i < mainBanks.length; i++) drawCloudBank(mainBanks[i], 'main', time, 0, true)
      for (let i = 0; i < scudBanks.length; i++) drawCloudBank(scudBanks[i], 'scud', time, 0, true)
      ctx.restore()
    }

    const drawStormFrontMask = () => {
      const skyBottom = height * 0.72
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
        if (deepIdle) {
          nextStrike = time + 7000 + Math.random() * 9000
          nextDistantThunder = time + 4200 + Math.random() * 5200
          deepIdle = false
        }
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

      const rumble = rumbleRef.current
      if (rumble && time - lastRumbleUpdate > 420) {
        lastRumbleUpdate = time
        const coverage = Math.max(0, Math.min(1, (pitchWorld.cloudCover - 0.08) / 0.84))
        const deepTarget = soundOnRef.current ? 0.017 + coverage * 0.018 : 0
        const textureTarget = soundOnRef.current ? 0.0035 + coverage * 0.0085 : 0
        if (Math.abs(deepTarget - lastDeepRumbleTarget) > 0.0008 || Number.isNaN(lastDeepRumbleTarget)) {
          rumble.deepGain.gain.setTargetAtTime(deepTarget, rumble.ctx.currentTime, 1.15)
          lastDeepRumbleTarget = deepTarget
        }
        if (Math.abs(textureTarget - lastTextureRumbleTarget) > 0.0006 || Number.isNaN(lastTextureRumbleTarget)) {
          rumble.textureGain.gain.setTargetAtTime(textureTarget, rumble.ctx.currentTime, 1.35)
          lastTextureRumbleTarget = textureTarget
        }
      }

      if (activeRef.current && stormMix > 0.62 && time >= nextStrike) {
        strike(time)
        nextStrike = time + 12000 + Math.random() * 18000
      }

      if (activeRef.current && stormMix > 0.34 && time >= nextDistantThunder) {
        distantThunder()
        nextDistantThunder = time + 6200 + Math.random() * 8200
      }

      if (!activeRef.current && stormMix < 0.08 && !deepIdle) {
        nextStrike = time + 7000 + Math.random() * 9000
        nextDistantThunder = time + 4200 + Math.random() * 5200
        deepIdle = true
      }

      if (sceneRef.current === 'black') {
        if (!canvasCleared) {
          ctx.clearRect(0, 0, width, height)
          canvasCleared = true
        }
        stormSignal.flash = 0
        return
      }

      if (time - lastCloudFrame < 40 && time > boltUntil) return
      lastCloudFrame = time

      if (stormMix < 0.003 && time > boltUntil) {
        if (!canvasCleared) {
          ctx.clearRect(0, 0, width, height)
          canvasCleared = true
        }
        stormSignal.flash = 0
        return
      }

      let flash = 0
      if (flashStarted >= 0) {
        const age = time - flashStarted
        if (age < 145) flash = Math.max(0, 1 - age / 145)
      }

      canvasCleared = false
      ctx.clearRect(0, 0, width, height)

      ctx.fillStyle = `rgba(0, 0, 0, ${0.042 * stormMix})`
      ctx.fillRect(0, 0, width, height)

      ctx.save()
      drawStormFrontMask()

      ctx.fillStyle = `rgba(0, 0, 0, ${0.19 * stormMix})`
      ctx.fillRect(0, 0, width, height * 0.74)

      ctx.fillStyle = `rgba(0, 0, 0, ${0.08 * stormMix})`
      ctx.fillRect(0, 0, width, height * 0.18)

      for (let i = 0; i < farBanks.length; i++) drawCloudBank(farBanks[i], 'far', time, flash)
      for (let i = 0; i < mainBanks.length; i++) drawCloudBank(mainBanks[i], 'main', time, flash)
      for (let i = 0; i < scudBanks.length; i++) drawCloudBank(scudBanks[i], 'scud', time, flash)
      drawMoonOcclusion(time)

      ctx.restore()

      if (flash > 0) {
        ctx.fillStyle = `rgba(205, 218, 229, ${0.105 * flash * stormMix})`
        ctx.fillRect(0, 0, width, height)
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
