import { useEffect, useRef } from 'react'
import type { Scene } from '../types'
import { getPitchAudio, getPitchAudioOutput } from '../audio/pitchAudio'
import { publishLightningGroundStrike } from '../world/lightningSignal'
import {
  ensureWorld,
  pitchWorld,
  stormSignal,
  surfaceYAt,
  worldIndexAt,
} from '../world/worldState'

type CloudLayer = 'far' | 'main' | 'scud'

type ContourMass = {
  bodyPath: Path2D
  ridgePath: Path2D
  underPath: Path2D
  corePath: Path2D
  width: number
  anchorX: number
  anchorY: number
  speed: number
  parallax: number
  driftY: number
  phase: number
  bodyAlpha: number
  ridgeAlpha: number
  underAlpha: number
  coreAlpha: number
  entryDelay: number
  entryDuration: number
  exitDelay: number
  exitDuration: number
}

function seededFrac(seed: number) {
  const n = Math.sin(seed * 127.1 + 311.7) * 43758.5453123
  return n - Math.floor(n)
}

function wrapValue(value: number, span: number) {
  return ((value % span) + span) % span
}

function smoothStep(value: number) {
  return value * value * (3 - 2 * value)
}

function valueNoise(x: number, seed: number) {
  const left = Math.floor(x)
  const frac = smoothStep(x - left)
  const a = seededFrac(seed + left * 1.971) * 2 - 1
  const b = seededFrac(seed + (left + 1) * 1.971) * 2 - 1
  return a + (b - a) * frac
}

function buildClosedContourPath(top: Float32Array, bottom: Float32Array, step: number, smooth: boolean) {
  const path = new Path2D()
  const last = top.length - 1
  path.moveTo(0, top[0])

  if (smooth) {
    for (let i = 1; i <= last; i++) {
      const prevX = (i - 1) * step
      const x = i * step
      const midX = (prevX + x) * 0.5
      const midY = (top[i - 1] + top[i]) * 0.5
      path.quadraticCurveTo(prevX, top[i - 1], midX, midY)
    }
    path.quadraticCurveTo(last * step, top[last], last * step, bottom[last])
    for (let i = last - 1; i >= 0; i--) {
      const nextX = (i + 1) * step
      const x = i * step
      const midX = (nextX + x) * 0.5
      const midY = (bottom[i + 1] + bottom[i]) * 0.5
      path.quadraticCurveTo(nextX, bottom[i + 1], midX, midY)
    }
    path.quadraticCurveTo(0, bottom[0], 0, top[0])
  } else {
    for (let i = 1; i <= last; i++) path.lineTo(i * step, top[i])
    for (let i = last; i >= 0; i--) path.lineTo(i * step, bottom[i])
  }

  path.closePath()
  return path
}

function createContourMass(
  viewportWidth: number,
  viewportHeight: number,
  layer: CloudLayer,
  index: number,
): ContourMass {
  const layerSeed = layer === 'far' ? 13.7 : layer === 'main' ? 41.9 : 79.3
  const seed = layerSeed + index * 11.73
  const a = seededFrac(seed + 0.7)
  const b = seededFrac(seed + 2.3)
  const c = seededFrac(seed + 5.9)

  const widthScale = layer === 'far'
    ? 0.70 + a * 0.46
    : layer === 'main'
      ? 0.46 + a * 0.36
      : 0.12 + a * 0.20
  const massWidth = Math.max(layer === 'scud' ? 120 : 310, viewportWidth * widthScale)
  const pointCount = layer === 'far' ? 32 : layer === 'main' ? 30 : 16
  const step = massWidth / (pointCount - 1)
  const top = new Float32Array(pointCount)
  const bottom = new Float32Array(pointCount)
  const ridgeBottom = new Float32Array(pointCount)
  const underTop = new Float32Array(pointCount)
  const coreTop = new Float32Array(pointCount)
  const coreBottom = new Float32Array(pointCount)

  const baseThickness = layer === 'far'
    ? viewportHeight * (0.18 + b * 0.10)
    : layer === 'main'
      ? viewportHeight * (0.16 + b * 0.12)
      : viewportHeight * (0.038 + b * 0.050)
  const broadAmplitude = layer === 'far' ? 22 : layer === 'main' ? 30 : 11
  const mediumAmplitude = layer === 'far' ? 13 : layer === 'main' ? 18 : 10
  const fineAmplitude = layer === 'scud' ? 7 : 4

  for (let i = 0; i < pointCount; i++) {
    const t = i / (pointCount - 1)
    const broad = valueNoise(i * 0.18, seed + 17.2)
    const medium = valueNoise(i * 0.43, seed + 39.1)
    const fine = valueNoise(i * (layer === 'scud' ? 1.34 : 0.86), seed + 67.4)
    const asymmetry = valueNoise(i * 0.27, seed + 88.6)
    const centreY = broad * broadAmplitude + medium * mediumAmplitude + fine * fineAmplitude

    const edge = Math.pow(Math.max(0, Math.sin(Math.PI * t)), layer === 'scud' ? 0.34 : 0.48)
    const thicknessNoise = 0.90 + valueNoise(i * 0.29, seed + 101.8) * 0.22 + valueNoise(i * 0.73, seed + 133.5) * 0.11
    const lobe = 0.88 + valueNoise(i * (layer === 'scud' ? 0.67 : 0.36), seed + 156.3) * (layer === 'scud' ? 0.22 : 0.16)
    const thickness = Math.max(0, baseThickness * thicknessNoise * lobe * edge)
    const topShare = 0.30 + asymmetry * 0.055
    const bottomShare = 1 - topShare

    const topY = centreY - thickness * topShare
    const bottomY = centreY + thickness * bottomShare
    top[i] = topY
    bottom[i] = bottomY

    const ridgeDepth = thickness * (layer === 'scud' ? 0.12 : 0.16)
    ridgeBottom[i] = topY + ridgeDepth
    underTop[i] = topY + thickness * (layer === 'scud' ? 0.50 : 0.57)
    coreTop[i] = topY + thickness * (layer === 'scud' ? 0.38 : 0.43)
    coreBottom[i] = topY + thickness * (layer === 'scud' ? 0.82 : 0.88)
  }

  const smooth = true
  return {
    bodyPath: buildClosedContourPath(top, bottom, step, smooth),
    ridgePath: buildClosedContourPath(top, ridgeBottom, step, smooth),
    underPath: buildClosedContourPath(underTop, bottom, step, smooth),
    corePath: buildClosedContourPath(coreTop, coreBottom, step, smooth),
    width: massWidth,
    anchorX: a,
    anchorY: layer === 'far'
      ? -0.015 + b * 0.13
      : layer === 'main'
        ? 0.055 + b * 0.23
        : 0.15 + b * 0.30,
    speed: layer === 'far' ? 0.65 + c * 0.22 : layer === 'main' ? 0.82 + c * 0.28 : 1.12 + c * 0.44,
    parallax: layer === 'far' ? 0.48 : layer === 'main' ? 0.82 : 1.28,
    driftY: layer === 'far' ? 1.4 + c * 1.2 : layer === 'main' ? 2.2 + c * 2.0 : 5 + c * 5,
    phase: seededFrac(seed + 203.1) * Math.PI * 2,
    bodyAlpha: layer === 'far' ? 0.22 : layer === 'main' ? 0.29 : 0.22,
    ridgeAlpha: layer === 'far' ? 0.014 : layer === 'main' ? 0.022 : 0.015,
    underAlpha: layer === 'far' ? 0.22 : layer === 'main' ? 0.32 : 0.27,
    coreAlpha: layer === 'far' ? 0.18 : layer === 'main' ? 0.29 : 0.27,
    entryDelay: layer === 'far'
      ? a * 2600
      : layer === 'main'
        ? 2200 + a * 4900
        : 5400 + a * 5950,
    entryDuration: layer === 'far'
      ? 7400 + b * 3100
      : layer === 'main'
        ? 8200 + b * 3800
        : 6000 + b * 3000,
    exitDelay: layer === 'far'
      ? a * 900
      : layer === 'main'
        ? 350 + a * 1300
        : a * 800,
    exitDuration: layer === 'far'
      ? 5200 + c * 1700
      : layer === 'main'
        ? 5600 + c * 1900
        : 3600 + c * 1600,
  }
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
    let frontDirection: 1 | -1 = Math.random() > 0.5 ? 1 : -1
    let wasActive = activeRef.current
    const initialPhaseTime = performance.now()
    let activationTime = activeRef.current ? initialPhaseTime - 18000 : Number.NEGATIVE_INFINITY
    let deactivationTime = activeRef.current ? Number.NEGATIVE_INFINITY : initialPhaseTime - 18000
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
    let farMasses: ContourMass[] = []
    let mainMasses: ContourMass[] = []
    let scudMasses: ContourMass[] = []

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
      const farCount = Math.max(2, Math.min(3, Math.round(width / 760)))
      const mainCount = Math.max(3, Math.min(4, Math.round(width / 560)))
      const scudCount = Math.max(4, Math.min(6, Math.round(width / 360)))
      farMasses = Array.from({ length: farCount }, (_, i) => createContourMass(width, height, 'far', i))
      mainMasses = Array.from({ length: mainCount }, (_, i) => createContourMass(width, height, 'main', i))
      scudMasses = Array.from({ length: scudCount }, (_, i) => createContourMass(width, height, 'scud', i))
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
      const strikeScene = sceneRef.current
      if (strikeScene === 'black') return

      if (strikeScene === 'snow') {
        // Lightning punches through the snowpack first. The persistent Ember
        // simulation below then decides whether the exposed fire survives.
        for (let offset = -5; offset <= 5; offset++) {
          const i = idx + offset
          if (i <= 1 || i >= pitchWorld.drifts.length - 2) continue
          const falloff = Math.max(0, 1 - Math.abs(offset) / 6)
          const melted = Math.min(pitchWorld.drifts[i], 2.05 * falloff * strength)
          pitchWorld.drifts[i] -= melted
          pitchWorld.water[i] = Math.min(9, pitchWorld.water[i] + melted * 0.10)
        }

        for (let offset = -3; offset <= 3; offset++) {
          const i = idx + offset
          if (i <= 1 || i >= pitchWorld.ember.length - 2) continue
          const falloff = Math.max(0, 1 - Math.abs(offset) / 4)
          pitchWorld.ember[i] = Math.max(pitchWorld.ember[i], (0.76 + strength * 0.18) * falloff)
          pitchWorld.char[i] = Math.max(pitchWorld.char[i], 0.09 * falloff)
        }
      } else if (strikeScene === 'rain') {
        // Wet ground takes the strike as a burst of heat rather than a lasting
        // fire. Consume a little standing water so the persistent world also
        // records that brief evaporation event.
        for (let offset = -4; offset <= 4; offset++) {
          const i = idx + offset
          if (i <= 1 || i >= pitchWorld.water.length - 2) continue
          const falloff = Math.max(0, 1 - Math.abs(offset) / 5)
          const evaporated = Math.min(pitchWorld.water[i], 0.72 * strength * falloff)
          pitchWorld.water[i] = Math.max(0, pitchWorld.water[i] - evaporated)
        }
      } else if (strikeScene === 'ember') {
        // Preserve the existing Ember strike behavior exactly.
        for (let offset = -3; offset <= 3; offset++) {
          const i = idx + offset
          if (i <= 1 || i >= pitchWorld.ember.length - 2) continue
          const falloff = Math.max(0, 1 - Math.abs(offset) / 4)
          pitchWorld.ember[i] = Math.max(pitchWorld.ember[i], (0.70 + strength * 0.18) * falloff)
          pitchWorld.char[i] = Math.max(pitchWorld.char[i], 0.08 * falloff)
        }
      }

      publishLightningGroundStrike(idx, x, strength, strikeScene)
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

    const clamp01 = (value: number) => Math.max(0, Math.min(1, value))

    const getMassPresence = (mass: ContourMass, time: number) => {
      if (activeRef.current) {
        const progress = clamp01((time - activationTime - mass.entryDelay) / mass.entryDuration)
        return smoothStep(progress)
      }
      const entryAtDeactivation = smoothStep(clamp01((deactivationTime - activationTime - mass.entryDelay) / mass.entryDuration))
      const progress = clamp01((time - deactivationTime - mass.exitDelay) / mass.exitDuration)
      return entryAtDeactivation * (1 - smoothStep(progress))
    }

    const getCloudCoverage = (time: number) => {
      let far = 0
      let main = 0
      let scud = 0

      for (let i = 0; i < farMasses.length; i++) far += getMassPresence(farMasses[i], time)
      for (let i = 0; i < mainMasses.length; i++) main += getMassPresence(mainMasses[i], time)
      for (let i = 0; i < scudMasses.length; i++) scud += getMassPresence(scudMasses[i], time)

      const farMix = farMasses.length ? far / farMasses.length : 0
      const mainMix = mainMasses.length ? main / mainMasses.length : 0
      const scudMix = scudMasses.length ? scud / scudMasses.length : 0
      return clamp01(farMix * 0.28 + mainMix * 0.57 + scudMix * 0.15)
    }

    const drawContourMass = (mass: ContourMass, layer: CloudLayer, time: number, flash: number) => {
      const presence = getMassPresence(mass, time)
      if (presence < 0.002) return

      const travelSpeed = layer === 'far' ? 0.0018 : layer === 'main' ? 0.0030 : 0.0056
      const span = width + mass.width * 1.45
      const travel = time * travelSpeed * frontDirection * mass.speed + cloudOffset * mass.parallax
      const baseX = wrapValue(mass.anchorX * span + travel, span) - mass.width * 0.72
      const entryShift = activeRef.current
        ? (frontDirection > 0 ? -1 : 1) * (width + mass.width) * (1 - presence)
        : 0
      const exitShift = activeRef.current
        ? 0
        : (frontDirection > 0 ? 1 : -1) * (width + mass.width) * (1 - presence)
      const x = baseX + entryShift + exitShift
      const y = height * mass.anchorY + Math.sin(time * (layer === 'scud' ? 0.00015 : 0.000052) + mass.phase) * mass.driftY

      const drawAt = (offsetX: number) => {
        ctx.translate(offsetX, y)

        const bodyColor = layer === 'far' ? 'rgb(23, 26, 30)' : layer === 'main' ? 'rgb(27, 31, 36)' : 'rgb(31, 35, 40)'
        const bodyAlpha = presence * (mass.bodyAlpha + flash * (layer === 'main' ? 0.08 : 0.045))

        if (layer !== 'scud') {
          ctx.fillStyle = bodyColor
          ctx.globalAlpha = bodyAlpha * 0.13
          ctx.translate(-3, -2)
          ctx.fill(mass.bodyPath)
          ctx.translate(6, 4)
          ctx.fill(mass.bodyPath)
          ctx.translate(-3, -2)
        }

        ctx.fillStyle = bodyColor
        ctx.globalAlpha = bodyAlpha
        ctx.fill(mass.bodyPath)

        ctx.fillStyle = 'rgb(5, 7, 9)'
        ctx.globalAlpha = presence * mass.underAlpha
        ctx.fill(mass.underPath)

        ctx.fillStyle = 'rgb(0, 0, 0)'
        ctx.globalAlpha = presence * mass.coreAlpha
        ctx.fill(mass.corePath)

        ctx.fillStyle = 'rgb(116, 125, 134)'
        ctx.globalAlpha = presence * (mass.ridgeAlpha + flash * (layer === 'main' ? 0.15 : layer === 'far' ? 0.09 : 0.07))
        ctx.fill(mass.ridgePath)

        ctx.translate(-offsetX, -y)
      }

      drawAt(x)
      // During arrival/exit, do not wrap in a replacement copy: the actual mass
      // should visibly enter or leave the world. Fully established storms can wrap.
      if (activeRef.current && presence > 0.995) {
        if (x + mass.width < width * 0.18) drawAt(x + span)
        else if (x > width * 0.82) drawAt(x - span)
      }
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
        activationTime = time
        deactivationTime = Number.NEGATIVE_INFINITY
        if (deepIdle) {
          nextStrike = time + 7000 + Math.random() * 9000
          nextDistantThunder = time + 4200 + Math.random() * 5200
          deepIdle = false
        }
      } else if (!activeRef.current && wasActive) {
        deactivationTime = time
      }
      wasActive = activeRef.current

      if (time > nextGust) {
        gustTarget = (Math.random() > 0.5 ? 1 : -1) * (0.72 + Math.random() * 0.78)
        nextGust = time + 4200 + Math.random() * 7200
      }
      gust += (gustTarget - gust) * (1 - Math.exp(-dt / 1450))
      cloudOffset += gust * dt * 0.016

      const cloudCoverage = getCloudCoverage(time)
      stormSignal.mix = stormMix
      stormSignal.wind = gust
      pitchWorld.cloudCover += ((0.12 + cloudCoverage * 0.80) - pitchWorld.cloudCover) * (1 - Math.exp(-dt / 1800))

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

      if (cloudCoverage < 0.003 && time > boltUntil) {
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

      ctx.fillStyle = `rgba(0, 0, 0, ${0.042 * cloudCoverage})`
      ctx.fillRect(0, 0, width, height)

      ctx.fillStyle = `rgba(0, 0, 0, ${0.19 * cloudCoverage})`
      ctx.fillRect(0, 0, width, height * 0.74)

      ctx.fillStyle = `rgba(0, 0, 0, ${0.08 * cloudCoverage})`
      ctx.fillRect(0, 0, width, height * 0.18)

      for (let i = 0; i < farMasses.length; i++) drawContourMass(farMasses[i], 'far', time, flash)
      for (let i = 0; i < mainMasses.length; i++) drawContourMass(mainMasses[i], 'main', time, flash)
      for (let i = 0; i < scudMasses.length; i++) drawContourMass(scudMasses[i], 'scud', time, flash)
      ctx.globalAlpha = 1

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
