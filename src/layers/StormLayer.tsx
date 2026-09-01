import { useEffect, useRef } from 'react'
import type { Scene } from '../types'
import { getPitchAudio, getPitchAudioOutput, getPitchAudioTransientOutput } from '../audio/pitchAudio'
import { publishLightningGroundStrike } from '../world/lightningSignal'
import {
  ensureWorld,
  pitchWorld,
  saveWorld,
  stormSignal,
  surfaceYAt,
  worldBaseY,
  worldIndexAt,
} from '../world/worldState'

type StormDensityLayerKind = 'upper' | 'main'

type StormDensityLayer = {
  kind: StormDensityLayerKind
  bodyCanvas: HTMLCanvasElement
  glowCanvas: HTMLCanvasElement
  revealCanvas: HTMLCanvasElement
  renderWidth: number
  renderHeight: number
  phaseX: number
  phaseY: number
  driftX: number
  driftY: number
  entryDelay: number
  entryDuration: number
  exitDuration: number
  retreat: number
}

type BoltPoint = { x: number; y: number }
type BoltPath = { points: BoltPoint[]; alpha: number; width: number }

const UPPER_LAYER_TIMING = { entryDelay: 0, entryDuration: 52000, exitDuration: 13800, retreat: 0.16 } as const
const MAIN_LAYER_TIMING = { entryDelay: 8800, entryDuration: 60000, exitDuration: 16200, retreat: 0.24 } as const

function between(min: number, max: number) {
  return min + Math.random() * (max - min)
}

function seededFrac(seed: number) {
  const n = Math.sin(seed * 127.1 + 311.7) * 43758.5453123
  return n - Math.floor(n)
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value))
}

function smoothStep(value: number) {
  return value * value * (3 - 2 * value)
}

function smoothPulse(edge0: number, edge1: number, edge2: number, edge3: number, x: number) {
  return clamp01((x - edge0) / (edge1 - edge0)) * (1 - clamp01((x - edge2) / (edge3 - edge2)))
}

function hash2D(ix: number, iy: number, seed: number) {
  const n = Math.sin(ix * 127.1 + iy * 311.7 + seed * 74.7) * 43758.5453123
  return n - Math.floor(n)
}

function valueNoise2D(x: number, y: number, seed: number) {
  const ix = Math.floor(x)
  const iy = Math.floor(y)
  const fx = smoothStep(x - ix)
  const fy = smoothStep(y - iy)

  const v00 = hash2D(ix, iy, seed)
  const v10 = hash2D(ix + 1, iy, seed)
  const v01 = hash2D(ix, iy + 1, seed)
  const v11 = hash2D(ix + 1, iy + 1, seed)

  const a = v00 + (v10 - v00) * fx
  const b = v01 + (v11 - v01) * fx
  return a + (b - a) * fy
}

function fbm2D(x: number, y: number, seed: number) {
  let total = 0
  let amplitude = 0.58
  let frequency = 1
  let normalizer = 0

  for (let octave = 0; octave < 4; octave++) {
    total += (valueNoise2D(x * frequency, y * frequency, seed + octave * 19.3) * 2 - 1) * amplitude
    normalizer += amplitude
    amplitude *= 0.52
    frequency *= 2.03
  }

  return total / normalizer
}



function distantRidgeY(x: number, width: number, height: number, layer: 'far' | 'mid' | 'near') {
  const nx = x / Math.max(1, width)

  if (layer === 'far') {
    const broad = fbm2D(nx * 1.22 + 2.4, 3.1, 143.7)
    const detail = fbm2D(nx * 2.9 + 6.8, 1.9, 211.3)
    return height * (0.648 + broad * 0.022 + detail * 0.006)
  }

  if (layer === 'mid') {
    const broad = fbm2D(nx * 1.58 + 5.9, 2.5, 317.9)
    const detail = fbm2D(nx * 4.4 + 1.2, 6.4, 401.6)
    return height * (0.705 + broad * 0.026 + detail * 0.008)
  }

  const broad = fbm2D(nx * 1.92 + 8.7, 2.1, 517.3)
  const detail = fbm2D(nx * 5.3 + 4.2, 4.6, 611.8)
  return height * (0.762 + broad * 0.030 + detail * 0.009)
}

function drawConifer(
  ctx: CanvasRenderingContext2D,
  x: number,
  baseY: number,
  height: number,
  width: number,
  lean: number,
  alpha: number,
) {
  const topX = x + lean * height * 0.10

  ctx.save()
  ctx.fillStyle = `rgba(0, 1, 2, ${alpha})`
  ctx.beginPath()
  ctx.moveTo(topX, baseY - height)
  ctx.lineTo(x - width * 0.26, baseY - height * 0.76)
  ctx.lineTo(x - width * 0.54, baseY - height * 0.55)
  ctx.lineTo(x - width * 0.18, baseY - height * 0.58)
  ctx.lineTo(x - width * 0.92, baseY - height * 0.22)
  ctx.lineTo(x - width * 0.16, baseY - height * 0.18)
  ctx.lineTo(x - width * 0.08, baseY)
  ctx.lineTo(x + width * 0.08, baseY)
  ctx.lineTo(x + width * 0.14, baseY - height * 0.18)
  ctx.lineTo(x + width * 0.88, baseY - height * 0.22)
  ctx.lineTo(x + width * 0.24, baseY - height * 0.58)
  ctx.lineTo(x + width * 0.56, baseY - height * 0.53)
  ctx.lineTo(x + width * 0.30, baseY - height * 0.77)
  ctx.closePath()
  ctx.fill()
  ctx.restore()
}

function drawDistantDepth(ctx: CanvasRenderingContext2D, width: number, height: number, power: number) {
  const reveal = smoothStep(clamp01(power))
  if (reveal < 0.002) return

  const foregroundY = worldBaseY(height)
  const landscapeFloor = Math.max(height * 0.79, foregroundY - 7)
  const shortLandscape = width > height * 1.35 && height <= 520

  ctx.save()

  // Keep the reveal concentrated around the horizon so the eye reads newly
  // discovered space, not a second generic lightning wash.
  const horizonGlow = ctx.createLinearGradient(0, height * 0.47, 0, foregroundY)
  horizonGlow.addColorStop(0, 'rgba(153, 170, 183, 0)')
  horizonGlow.addColorStop(0.35, `rgba(153, 170, 183, ${0.028 * reveal})`)
  horizonGlow.addColorStop(0.66, `rgba(176, 191, 202, ${0.110 * reveal})`)
  horizonGlow.addColorStop(1, `rgba(144, 159, 171, ${0.022 * reveal})`)
  ctx.fillStyle = horizonGlow
  ctx.fillRect(0, height * 0.46, width, Math.max(1, foregroundY - height * 0.46))

  const drawRidge = (layer: 'far' | 'mid' | 'near', step: number, fill: string) => {
    ctx.beginPath()
    ctx.moveTo(0, landscapeFloor)
    for (let x = 0; x <= width + step; x += step) {
      const px = Math.min(width, x)
      ctx.lineTo(px, distantRidgeY(px, width, height, layer))
    }
    ctx.lineTo(width, landscapeFloor)
    ctx.closePath()
    ctx.fillStyle = fill
    ctx.fill()
  }

  const farReveal = smoothStep(clamp01((reveal - 0.16) / 0.84))
  const midReveal = smoothStep(clamp01((reveal - 0.06) / 0.94))

  if (farReveal > 0.01) {
    drawRidge('far', Math.max(12, width / 66), `rgba(28, 33, 37, ${0.16 * farReveal})`)
  }
  if (midReveal > 0.01) {
    drawRidge('mid', Math.max(10, width / 78), `rgba(13, 16, 19, ${0.30 * midReveal})`)
  }
  drawRidge('near', Math.max(8, width / 92), `rgba(1, 2, 3, ${0.90 * reveal})`)

  // Add a very subtle atmospheric shelf between the two most distant bands so the
  // reveal feels like depth receding into darkness rather than one flat backdrop.
  if (farReveal > 0.01) {
    const haze = ctx.createLinearGradient(0, height * 0.58, 0, height * 0.78)
    haze.addColorStop(0, `rgba(190, 200, 208, ${0.014 * farReveal})`)
    haze.addColorStop(0.55, `rgba(145, 158, 170, ${0.010 * farReveal})`)
    haze.addColorStop(1, 'rgba(145, 158, 170, 0)')
    ctx.fillStyle = haze
    ctx.fillRect(0, height * 0.56, width, foregroundY - height * 0.56)
  }

  // Trees are clustered and sparse, with long empty stretches. The shape/placement
  // is deterministic so lightning reveals the same hidden landscape each time.
  const clumpCount = Math.max(3, Math.min(6, Math.round(width / (shortLandscape ? 250 : 220))))
  for (let c = 0; c < clumpCount; c++) {
    const start = width * (0.06 + seededFrac(801.3 + c * 21.2) * 0.78)
    const span = width * (0.08 + seededFrac(877.4 + c * 17.9) * (shortLandscape ? 0.12 : 0.16))
    const clumpLayer: 'near' = 'near'
    const count = 2 + Math.floor(seededFrac(992.4 + c * 9.6) * (clumpLayer === 'near' ? 4 : 3))

    for (let i = 0; i < count; i++) {
      const local = count === 1 ? 0.5 : i / Math.max(1, count - 1)
      const offset = (seededFrac(1071.8 + c * 37.1 + i * 19.3) - 0.5) * span * 0.22
      const x = Math.max(width * 0.03, Math.min(width * 0.97, start + span * local + offset))
      const ridgeY = distantRidgeY(x, width, height, clumpLayer)
      const heightScale = 1
      const treeHeight = ((shortLandscape ? 8 : 11) + seededFrac(1148.3 + c * 23.8 + i * 15.6) * (shortLandscape ? 12 : 18)) * heightScale
      const treeWidth = treeHeight * (0.18 + seededFrac(1234.6 + c * 18.4 + i * 10.1) * 0.10)
      const lean = (seededFrac(1307.1 + c * 27.3 + i * 16.9) - 0.5) * 0.60
      const alpha = 0.96 * reveal * (0.88 + seededFrac(1412.8 + c * 12.5 + i * 17.4) * 0.18)
      const baseY = ridgeY
      drawConifer(ctx, x, baseY, treeHeight, treeWidth, lean, alpha)
    }
  }

  // A handful of isolated sentinels stop the treeline from reading as neat clusters.
  const solitaryCount = shortLandscape ? 2 : 3
  for (let i = 0; i < solitaryCount; i++) {
    const x = width * (0.10 + seededFrac(1612.4 + i * 41.7) * 0.80)
    const layer: 'near' = 'near'
    const ridgeY = distantRidgeY(x, width, height, layer)
    const treeHeight = (shortLandscape ? 15 : 21) * (0.86 + seededFrac(1755.7 + i * 15.3) * 0.28)
    const treeWidth = treeHeight * (0.18 + seededFrac(1833.9 + i * 12.2) * 0.08)
    const lean = (seededFrac(1884.2 + i * 19.4) - 0.5) * 0.46
    const alpha = 0.92 * reveal
    drawConifer(ctx, x, ridgeY, treeHeight, treeWidth, lean, alpha)
  }

  ctx.restore()
}

function createTintedCanvas(width: number, height: number) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return canvas
}

/**
 * Generate a low-resolution cloud-density field once, then let browser scaling do the
 * softening at runtime. This avoids per-frame blur or visible geometric construction.
 */
function createStormDensityLayer(
  viewportWidth: number,
  viewportHeight: number,
  kind: StormDensityLayerKind,
): StormDensityLayer {
  const shortLandscape = viewportWidth > viewportHeight * 1.35 && viewportHeight <= 520
  const seed = kind === 'upper' ? 27.4 : 83.2
  const mapWidth = shortLandscape ? 320 : viewportWidth < 700 ? 360 : 460
  const mapHeight = kind === 'upper'
    ? (shortLandscape ? 120 : 170)
    : (shortLandscape ? 145 : 210)
  const density = new Float32Array(mapWidth * mapHeight)

  for (let y = 0; y < mapHeight; y++) {
    const ny = y / (mapHeight - 1)

    for (let x = 0; x < mapWidth; x++) {
      const nx = x / (mapWidth - 1)

      // Build the storm as a continuous ceiling with an irregular, torn lower
      // edge rather than a collection of rounded cloud bodies. Long horizontal
      // wavelengths establish the front; smaller warped noise only breaks up
      // the underside and internal density.
      const broadBase = fbm2D(nx * 0.92 + 3.2, 1.7, seed + 8.4)
      const midBase = fbm2D(nx * 2.45 + 7.8, 4.1, seed + 17.9)
      const fineBase = fbm2D(nx * 5.2 + 1.4, 2.8, seed + 29.6)
      const cloudBase = kind === 'upper'
        ? 0.49 + broadBase * 0.115 + midBase * 0.050 + fineBase * 0.016
        : 0.665 + broadBase * 0.105 + midBase * 0.064 + fineBase * 0.020

      const warpX = fbm2D(nx * 1.35 + 5.1, ny * 1.05 + 2.2, seed + 41.3) * 0.095
      const warpY = fbm2D(nx * 1.05 + 8.4, ny * 1.55 + 0.9, seed + 53.7) * 0.070
      const interior = fbm2D((nx + warpX) * 1.55 + 2.0, (ny + warpY) * 1.15 + 5.5, seed + 67.2)
      const medium = fbm2D((nx - warpX * 0.45) * 3.6 + 6.3, (ny + warpY) * 2.8 + 1.8, seed + 79.9)
      const detail = fbm2D(nx * 7.8 + 1.1, ny * 5.9 + 8.2, seed + 96.4)

      const signedDepth = cloudBase - ny
      const ceilingMass = smoothStep(clamp01((signedDepth + (kind === 'upper' ? 0.17 : 0.20)) / (kind === 'upper' ? 0.25 : 0.29)))
      const internalVariation = clamp01(0.82 + interior * 0.22 + medium * 0.11 + detail * 0.035)

      // Wisps extend below the main deck only where the noise supports them;
      // this makes the base fray and dissolve instead of forming scallops.
      const undersideBand = 1 - smoothStep(clamp01(Math.abs(ny - cloudBase) / (kind === 'upper' ? 0.22 : 0.25)))
      const wispNoise = clamp01((fbm2D(nx * 2.15 + 9.1, ny * 4.15 + 3.7, seed + 121.8) + 0.30) * 1.18)
      const hangingNoise = clamp01((fbm2D(nx * 4.9 + 2.7, ny * 2.25 + 6.8, seed + 143.6) + 0.22) * 1.10)
      const belowBase = smoothStep(clamp01((ny - cloudBase + 0.025) / 0.17))
      const wisps = undersideBand * belowBase * wispNoise * hangingNoise * (kind === 'upper' ? 0.22 : 0.34)

      // Sparse broad thinning keeps the cloud deck alive without punching round
      // holes into it. The storm remains one coherent moving atmospheric mass.
      const thinning = fbm2D(nx * 1.18 + 11.3, ny * 0.86 + 1.5, seed + 171.2)
      const openness = 0.90 + thinning * 0.11
      let localDensity = ceilingMass * internalVariation * openness + wisps
      localDensity = clamp01(localDensity)
      localDensity = smoothStep(localDensity)

      density[y * mapWidth + x] = localDensity
    }
  }

  const bodyCanvas = createTintedCanvas(mapWidth, mapHeight)
  const glowCanvas = createTintedCanvas(mapWidth, mapHeight)
  const revealCanvas = createTintedCanvas(mapWidth, mapHeight)
  const bodyCtx = bodyCanvas.getContext('2d')!
  const glowCtx = glowCanvas.getContext('2d')!
  const revealCtx = revealCanvas.getContext('2d')!
  const bodyImage = bodyCtx.createImageData(mapWidth, mapHeight)
  const glowImage = glowCtx.createImageData(mapWidth, mapHeight)
  const revealImage = revealCtx.createImageData(mapWidth, mapHeight)
  const bodyPixels = bodyImage.data
  const glowPixels = glowImage.data
  const revealPixels = revealImage.data

  for (let y = 0; y < mapHeight; y++) {
    const ny = y / (mapHeight - 1)
    for (let x = 0; x < mapWidth; x++) {
      const i = y * mapWidth + x
      const d = density[i]
      const below = y < mapHeight - 1 ? density[i + mapWidth] : 0
      const below2 = y < mapHeight - 2 ? density[i + mapWidth * 2] : 0
      const above = y > 0 ? density[i - mapWidth] : d
      const edge = clamp01((d - below) * 2.4)
      const internal = clamp01((d - above) * 1.9)
      const lowerMask = smoothPulse(0.14, 0.30, 0.88, 1.00, ny)
      const moonBias = 0.70 + 0.30 * (1 - Math.abs((x / (mapWidth - 1)) - 0.5) * 2)
      const wispMask = smoothPulse(0.22, 0.42, 0.86, 0.98, ny)

      const bodyAlpha = Math.round(Math.pow(d, 1.15) * (kind === 'upper' ? 150 : 181))
      const glowAlpha = Math.round(clamp01(edge * 0.78 + (d - below2) * 0.22) * lowerMask * moonBias * (kind === 'upper' ? 19 : 29))
      const revealAlpha = Math.round(clamp01(d * 0.40 + edge * 1.02 + internal * 0.58 + wispMask * d * 0.16) * (kind === 'upper' ? 118 : 158))
      const softFold = Math.round(clamp01(internal * 0.60 + d * 0.14) * (kind === 'upper' ? 24 : 34))

      const bi = i * 4
      bodyPixels[bi] = kind === 'upper' ? 5 : 3
      bodyPixels[bi + 1] = kind === 'upper' ? 6 : 4
      bodyPixels[bi + 2] = kind === 'upper' ? 8 : 6
      bodyPixels[bi + 3] = bodyAlpha

      glowPixels[bi] = 130
      glowPixels[bi + 1] = 138
      glowPixels[bi + 2] = 146
      glowPixels[bi + 3] = glowAlpha

      revealPixels[bi] = 112 + softFold
      revealPixels[bi + 1] = 120 + softFold
      revealPixels[bi + 2] = 128 + softFold
      revealPixels[bi + 3] = revealAlpha
    }
  }

  bodyCtx.putImageData(bodyImage, 0, 0)
  glowCtx.putImageData(glowImage, 0, 0)
  revealCtx.putImageData(revealImage, 0, 0)

  return {
    kind,
    bodyCanvas,
    glowCanvas,
    revealCanvas,
    renderWidth: Math.round(viewportWidth * (kind === 'upper' ? 1.24 : 1.16)),
    renderHeight: Math.round(viewportHeight * (kind === 'upper'
      ? (shortLandscape ? 0.45 : 0.61)
      : (shortLandscape ? 0.52 : 0.72))),
    phaseX: seededFrac(seed + 131.7) * Math.PI * 2,
    phaseY: seededFrac(seed + 211.9) * Math.PI * 2,
    driftX: viewportWidth * (kind === 'upper' ? 0.022 : 0.032),
    driftY: viewportHeight * (kind === 'upper' ? 0.012 : 0.018),
    entryDelay: kind === 'upper' ? UPPER_LAYER_TIMING.entryDelay : MAIN_LAYER_TIMING.entryDelay,
    entryDuration: kind === 'upper' ? UPPER_LAYER_TIMING.entryDuration : MAIN_LAYER_TIMING.entryDuration,
    exitDuration: kind === 'upper' ? UPPER_LAYER_TIMING.exitDuration : MAIN_LAYER_TIMING.exitDuration,
    retreat: kind === 'upper' ? UPPER_LAYER_TIMING.retreat : MAIN_LAYER_TIMING.retreat,
  }
}

export function StormLayer({
  active,
  scene,
  soundOn,
  groundStrikeChance = 0.42,
  depthRevealEventId = 0,
}: {
  active: boolean
  scene: Scene
  soundOn: boolean
  groundStrikeChance?: number
  depthRevealEventId?: number
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const activeRef = useRef(active)
  const sceneRef = useRef(scene)
  const soundOnRef = useRef(soundOn)
  const groundStrikeChanceRef = useRef(groundStrikeChance)
  const depthRevealEventIdRef = useRef(depthRevealEventId)
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
    groundStrikeChanceRef.current = Math.max(0, Math.min(1, groundStrikeChance))
  }, [groundStrikeChance])

  useEffect(() => {
    depthRevealEventIdRef.current = depthRevealEventId
  }, [depthRevealEventId])

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
    let idleTimer = 0
    let last = performance.now()
    let lastCloudFrame = 0
    let stormMix = activeRef.current ? 1 : 0
    let wasActive = activeRef.current
    const initialPhaseTime = performance.now()
    let activationTime = activeRef.current ? initialPhaseTime - 70000 : initialPhaseTime
    let deactivationTime = activeRef.current ? Number.NEGATIVE_INFINITY : initialPhaseTime
    let gust = 0
    let gustTarget = 0
    let nextGust = performance.now() + 3600
    let nextStrike = performance.now() + 5200 + Math.random() * 7600
    let queuedStrikeBurst = 0
    let nextDistantThunder = performance.now() + 3800 + Math.random() * 4800
    let flashStarted = -1
    let flashPower = 0
    let depthRevealStarted = -1
    let depthRevealPower = 0
    let forcedVisualUntil = -1
    let nextNaturalDepthReveal = performance.now() + between(42_000, 88_000)
    let lastDepthRevealEventId = depthRevealEventIdRef.current
    let boltUntil = -1
    let boltPaths: BoltPath[] = []
    let canvasCleared = false
    let deepIdle = !activeRef.current && stormMix < 0.08
    let lastRumbleUpdate = 0
    let lastDeepRumbleTarget = Number.NaN
    let lastTextureRumbleTarget = Number.NaN
    let upperLayer: StormDensityLayer | null = null
    let mainLayer: StormDensityLayer | null = null

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
      upperLayer = createStormDensityLayer(width, height, 'upper')
      mainLayer = createStormDensityLayer(width, height, 'main')
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
      bodySource.connect(bodyFilter).connect(bodyGain).connect(getPitchAudioTransientOutput(audioCtx))
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
      textureSource.connect(textureFilter).connect(textureGain).connect(getPitchAudioTransientOutput(audioCtx))
      textureSource.start(startTime + 0.035 + Math.random() * 0.055)
    }

    const thunder = (strength: number) => {
      if (!soundOnRef.current) return
      const audioCtx = getPitchAudio()
      if (!audioCtx) return

      const bank = getThunderBank(audioCtx)
      const buffer = bank.strike[Math.random() < 0.5 ? 0 : 1]
      // A visible terrain hit reads as very close. Keep the sound attached to the
      // impact instead of waiting several seconds as though the bolt were miles away.
      const delay = 0.10 + (1 - strength) * 0.16 + Math.random() * 0.10
      const startTime = audioCtx.currentTime + delay
      const rate = 0.90 + Math.random() * 0.08

      // Close-strike pressure wave. Deliberately low-passed: the previous short,
      // bright band-pass transient sounded like a ruler being slapped on a desk.
      const boomDuration = 0.72
      const boomBuffer = audioCtx.createBuffer(1, Math.floor(audioCtx.sampleRate * boomDuration), audioCtx.sampleRate)
      const boomData = boomBuffer.getChannelData(0)
      let low = 0
      for (let i = 0; i < boomData.length; i++) {
        const t = i / audioCtx.sampleRate
        const white = Math.random() * 2 - 1
        low = low * 0.955 + white * 0.045
        const attack = Math.min(1, t / 0.028)
        const decay = Math.exp(-t / (0.22 + strength * 0.09))
        boomData[i] = low * attack * decay
      }

      const boomSource = audioCtx.createBufferSource()
      const boomFilter = audioCtx.createBiquadFilter()
      const boomGain = audioCtx.createGain()
      boomSource.buffer = boomBuffer
      boomFilter.type = 'lowpass'
      boomFilter.frequency.value = 150 + strength * 55
      boomFilter.Q.value = 0.58
      boomGain.gain.setValueAtTime(0.0001, startTime)
      boomGain.gain.exponentialRampToValueAtTime(0.055 + strength * 0.025, startTime + 0.030)
      boomGain.gain.exponentialRampToValueAtTime(0.0001, startTime + boomDuration)
      boomSource.connect(boomFilter).connect(boomGain).connect(getPitchAudioTransientOutput(audioCtx))
      boomSource.start(startTime)

      // The broader thunder body arrives with the pressure wave and then rolls away.
      playThunderBuffer(
        audioCtx,
        buffer,
        delay + 0.025,
        0.090 + strength * 0.038,
        0.009 + strength * 0.006,
        rate,
        225 + strength * 50,
      )

      if (strength > 0.78 && Math.random() < 0.44) {
        const tailBuffer = bank.distant[Math.random() < 0.5 ? 0 : 1]
        playThunderBuffer(
          audioCtx,
          tailBuffer,
          delay + 1.45 + Math.random() * 1.10,
          0.024 + strength * 0.014,
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
        // A direct hit should read as an event, not a tiny dent. It punches a
        // broad bowl through the snow, flashes some melt-water into existence,
        // and leaves enough heat/char for EmberScene to preserve the aftermath.
        for (let offset = -12; offset <= 12; offset++) {
          const i = idx + offset
          if (i <= 1 || i >= pitchWorld.drifts.length - 2) continue
          const falloff = Math.max(0, 1 - Math.abs(offset) / 13)
          const crater = Math.pow(falloff, 1.55)
          const melted = Math.min(pitchWorld.drifts[i], (18 + strength * 14) * crater)
          pitchWorld.drifts[i] = Math.max(0, pitchWorld.drifts[i] - melted)
          pitchWorld.water[i] = Math.min(11, pitchWorld.water[i] + melted * 0.10)
        }
        pitchWorld.waterLevel = Math.max(0, pitchWorld.waterLevel - 0.010 * strength)

        for (let offset = -7; offset <= 7; offset++) {
          const i = idx + offset
          if (i <= 1 || i >= pitchWorld.ember.length - 2) continue
          const falloff = Math.max(0, 1 - Math.abs(offset) / 8)
          const heat = Math.pow(falloff, 1.18)
          pitchWorld.ember[i] = Math.max(pitchWorld.ember[i], (1.02 + strength * 0.28) * heat)
          pitchWorld.char[i] = Math.max(pitchWorld.char[i], (0.18 + strength * 0.52) * heat)
        }
      } else if (strikeScene === 'rain') {
        for (let offset = -10; offset <= 10; offset++) {
          const i = idx + offset
          if (i <= 1 || i >= pitchWorld.water.length - 2) continue
          const falloff = Math.max(0, 1 - Math.abs(offset) / 11)
          const boil = Math.pow(falloff, 1.35)
          const evaporated = Math.min(pitchWorld.water[i], (1.20 + strength * 0.85) * boil)
          pitchWorld.water[i] = Math.max(0, pitchWorld.water[i] - evaporated)
        }
        pitchWorld.waterLevel = Math.max(0, pitchWorld.waterLevel - 0.018 * strength)

        // A direct strike can briefly ignite the wet ground, but the shared
        // water/ice plane stays visually intact; steam carries the heat response.
        for (let offset = -6; offset <= 6; offset++) {
          const i = idx + offset
          if (i <= 1 || i >= pitchWorld.ember.length - 2) continue
          const falloff = Math.max(0, 1 - Math.abs(offset) / 7)
          const heat = Math.pow(falloff, 1.28)
          pitchWorld.ember[i] = Math.max(pitchWorld.ember[i], (0.88 + strength * 0.24) * heat)
          pitchWorld.char[i] = Math.max(pitchWorld.char[i], (0.10 + strength * 0.24) * heat)
        }
      } else if (strikeScene === 'ember') {
        for (let offset = -3; offset <= 3; offset++) {
          const i = idx + offset
          if (i <= 1 || i >= pitchWorld.ember.length - 2) continue
          const falloff = Math.max(0, 1 - Math.abs(offset) / 4)
          pitchWorld.ember[i] = Math.max(pitchWorld.ember[i], (0.70 + strength * 0.18) * falloff)
          pitchWorld.char[i] = Math.max(pitchWorld.char[i], 0.08 * falloff)
        }
      }

      publishLightningGroundStrike(idx, x, strength, strikeScene)
      saveWorld()
    }

    const triggerDepthReveal = (time: number, ambient = false) => {
      depthRevealStarted = time
      depthRevealPower = ambient ? 0.82 + Math.random() * 0.16 : 0.72 + Math.random() * 0.22

      if (!ambient) return

      // Alive can reveal the landscape with lightning beyond the visible frame.
      // Give the horizon a brief exposure without inventing an on-screen bolt.
      flashStarted = time
      flashPower = 0.74 + Math.random() * 0.14
      forcedVisualUntil = time + 520
      if (soundOnRef.current) distantThunder()
    }

    const strike = (time: number) => {
      const targetX = width * (0.14 + Math.random() * 0.72)
      const grounded = Math.random() < groundStrikeChanceRef.current
      const targetY = grounded
        ? surfaceYAt(targetX, width, height)
        : height * between(0.28, 0.62)
      const strength = 0.70 + Math.random() * 0.30
      const startX = targetX + (Math.random() - 0.5) * width * 0.16
      const segments = 9

      const main: BoltPoint[] = [{ x: startX, y: -12 }]
      for (let i = 1; i < segments; i++) {
        const t = i / segments
        main.push({
          x: startX * (1 - t) + targetX * t + (Math.random() - 0.5) * 34 * (1 - t),
          y: targetY * t,
        })
      }
      main.push({ x: targetX, y: targetY })

      boltPaths = [{ points: main, alpha: 0.48, width: 0.68 }]
      const forkCount = Math.random() < 0.78 ? 1 + (Math.random() < 0.38 ? 1 : 0) + (Math.random() < 0.16 ? 1 : 0) : 0
      for (let branch = 0; branch < forkCount; branch++) {
        const originIndex = 2 + Math.floor(Math.random() * Math.max(1, main.length - 5))
        const origin = main[originIndex]
        const branchPoints: BoltPoint[] = [{ x: origin.x, y: origin.y }]
        const branchSegments = 2 + Math.floor(Math.random() * 3)
        let bx = origin.x
        let by = origin.y
        for (let i = 0; i < branchSegments; i++) {
          const step = 12 + Math.random() * 28
          bx += (Math.random() > 0.5 ? 1 : -1) * step
          by += (targetY - origin.y) * (0.11 + Math.random() * 0.14)
          branchPoints.push({ x: bx, y: Math.min(targetY - 10, by) })
        }
        boltPaths.push({ points: branchPoints, alpha: 0.28 + Math.random() * 0.14, width: 0.34 + Math.random() * 0.18 })
      }

      flashStarted = time
      flashPower = 0.92 + strength * 0.16
      boltUntil = time + 210
      // Only an occasional strong strike exposes the hidden landscape. The
      // cooldown prevents a burst of lightning from repeating the trick.
      if (time >= nextNaturalDepthReveal && strength > 0.89 && Math.random() < 0.13) {
        triggerDepthReveal(time)
        nextNaturalDepthReveal = time + between(105_000, 195_000)
      }
      if (grounded) {
        strikeWorld(targetX, strength)
        thunder(strength)
      } else {
        distantThunder()
      }
    }

    const getLayerPresence = (layer: StormDensityLayer, time: number) => {
      if (activeRef.current) {
        const progress = clamp01((time - activationTime - layer.entryDelay) / layer.entryDuration)
        return smoothStep(progress)
      }

      const entryAtDeactivation = smoothStep(clamp01(
        (deactivationTime - activationTime - layer.entryDelay) / layer.entryDuration,
      ))
      const exitProgress = clamp01((time - deactivationTime) / layer.exitDuration)
      return entryAtDeactivation * (1 - smoothStep(exitProgress))
    }

    const getCloudCoverage = (time: number) => {
      const upper = upperLayer ? getLayerPresence(upperLayer, time) : 0
      const main = mainLayer ? getLayerPresence(mainLayer, time) : 0
      return clamp01(upper * 0.34 + main * 0.66)
    }

    const drawDensityLayer = (layer: StormDensityLayer, time: number, flash: number) => {
      const presence = getLayerPresence(layer, time)
      if (presence < 0.001) return

      const settled = Math.pow(presence, 0.86)
      const x = (width - layer.renderWidth) * 0.5
        + Math.sin(time * (layer.kind === 'upper' ? 0.000007 : 0.000010) + layer.phaseX) * layer.driftX
      const y = -layer.renderHeight * layer.retreat * (1 - settled)
        + Math.sin(time * (layer.kind === 'upper' ? 0.000006 : 0.000009) + layer.phaseY) * layer.driftY

      ctx.globalAlpha = 0.28 + settled * (layer.kind === 'upper' ? 0.64 : 0.80)
      ctx.drawImage(layer.bodyCanvas, x, y, layer.renderWidth, layer.renderHeight)

      ctx.globalAlpha = settled * (layer.kind === 'upper' ? 0.68 : 0.84)
      ctx.drawImage(layer.glowCanvas, x, y, layer.renderWidth, layer.renderHeight)

      if (flash > 0) {
        ctx.globalAlpha = flash * settled * (layer.kind === 'upper' ? 0.90 : 1.00)
        ctx.drawImage(layer.revealCanvas, x, y, layer.renderWidth, layer.renderHeight)
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

      const requestedDepthReveal = depthRevealEventIdRef.current
      if (requestedDepthReveal !== lastDepthRevealEventId) {
        lastDepthRevealEventId = requestedDepthReveal
        if (requestedDepthReveal > 0) triggerDepthReveal(time, true)
      }

      // When Storm is completely absent, there is no reason to run gust/cloud
      // bookkeeping at display refresh rate. Keep a lightweight heartbeat so a
      // prop/event wakes immediately while the inactive overlay is essentially free.
      const revealFinished = depthRevealStarted < 0 || time - depthRevealStarted > 460
      const fullyIdle = !activeRef.current && stormMix < 0.002 && time > boltUntil && revealFinished
      if (fullyIdle) {
        stormSignal.mix = 0
        stormSignal.wind = 0
        stormSignal.flash = 0
        pitchWorld.cloudCover += (0.12 - pitchWorld.cloudCover) * 0.18
        cancelAnimationFrame(raf)
        idleTimer = window.setTimeout(() => {
          raf = requestAnimationFrame(draw)
        }, 180)
        return
      }

      if (activeRef.current && !wasActive) {
        activationTime = time
        deactivationTime = Number.NEGATIVE_INFINITY
        if (deepIdle) {
          nextStrike = time + 5200 + Math.random() * 7600
          queuedStrikeBurst = 0
          nextDistantThunder = time + 3800 + Math.random() * 4800
          deepIdle = false
        }
      } else if (!activeRef.current && wasActive) {
        deactivationTime = time
      }
      wasActive = activeRef.current

      if (time > nextGust) {
        gustTarget = (Math.random() > 0.5 ? 1 : -1) * (0.96 + Math.random() * 1.10)
        nextGust = time + 3200 + Math.random() * 5600
      }
      gust += (gustTarget - gust) * (1 - Math.exp(-dt / 1180))

      const cloudCoverage = getCloudCoverage(time)
      stormSignal.mix = stormMix
      stormSignal.wind = gust * (0.92 + cloudCoverage * 0.30)
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

      if (activeRef.current && stormMix > 0.58 && time >= nextStrike) {
        strike(time)
        if (queuedStrikeBurst > 0) {
          queuedStrikeBurst -= 1
          nextStrike = time + 1800 + Math.random() * 3200
        } else if (Math.random() < 0.26) {
          queuedStrikeBurst = 1 + Math.floor(Math.random() * 2)
          nextStrike = time + 6200 + Math.random() * 6200
        } else {
          nextStrike = time + 7800 + Math.random() * 12800
        }
      }

      if (activeRef.current && stormMix > 0.34 && time >= nextDistantThunder) {
        distantThunder()
        nextDistantThunder = time + 6200 + Math.random() * 8200
      }

      if (!activeRef.current && stormMix < 0.08 && !deepIdle) {
        nextStrike = time + 5200 + Math.random() * 7600
        queuedStrikeBurst = 0
        nextDistantThunder = time + 3800 + Math.random() * 4800
        deepIdle = true
      }

      if (time - lastCloudFrame < 40 && time > boltUntil) return
      lastCloudFrame = time

      let depthReveal = 0
      if (depthRevealStarted >= 0) {
        const age = time - depthRevealStarted
        const primary = age < 82 ? 1 - age / 82 : 0
        const secondary = age > 96 && age < 228 ? 0.62 * (1 - (age - 96) / 132) : 0
        const afterimage = age > 228 && age < 430 ? 0.16 * (1 - (age - 228) / 202) : 0
        depthReveal = Math.max(primary, secondary, afterimage) * depthRevealPower
      }

      if (cloudCoverage < 0.003 && time > boltUntil && depthReveal < 0.002) {
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
        const primary = age < 58 ? 1 - age / 58 : 0
        const secondary = age > 68 && age < 138 ? 0.34 * (1 - (age - 68) / 70) : 0
        flash = Math.max(primary, secondary) * flashPower
      }

      canvasCleared = false
      ctx.clearRect(0, 0, width, height)

      // Keep the lower world slightly storm-darkened without dimming the moon itself.
      ctx.fillStyle = `rgba(0, 0, 0, ${0.065 * cloudCoverage})`
      ctx.fillRect(0, height * 0.60, width, height * 0.40)

      if (upperLayer) drawDensityLayer(upperLayer, time, flash)
      if (mainLayer) drawDensityLayer(mainLayer, time, flash)
      ctx.globalAlpha = 1

      const forcedVisualMix = time < forcedVisualUntil ? 1 : 0
      const visualMix = Math.max(stormMix, forcedVisualMix)
      if (flash > 0) {
        ctx.fillStyle = `rgba(205, 218, 229, ${0.085 * flash * visualMix})`
        ctx.fillRect(0, 0, width, height)
      }

      if (depthReveal > 0.001) drawDistantDepth(ctx, width, height, depthReveal * visualMix)
      stormSignal.flash = flash * stormMix

      if (time < boltUntil && boltPaths.length > 0) {
        const fade = Math.max(0, (boltUntil - time) / 210) * visualMix
        for (const path of boltPaths) {
          if (path.points.length < 2) continue
          ctx.beginPath()
          ctx.moveTo(path.points[0].x, path.points[0].y)
          for (let i = 1; i < path.points.length; i++) ctx.lineTo(path.points[i].x, path.points[i].y)
          ctx.strokeStyle = `rgba(225, 234, 240, ${path.alpha * fade})`
          ctx.lineWidth = path.width
          ctx.stroke()
        }
      }
    }

    resize()
    window.addEventListener('resize', resize)
    raf = requestAnimationFrame(draw)

    return () => {
      cancelAnimationFrame(raf)
      window.clearTimeout(idleTimer)
      window.removeEventListener('resize', resize)
      stormSignal.mix = 0
      stormSignal.wind = 0
      stormSignal.flash = 0
    }
  }, [])

  return <canvas className="scene-canvas storm-layer-canvas" ref={canvasRef} aria-hidden="true" />
}
