import { useEffect, useRef } from 'react'
import { loadPitchAudioAsset } from '../audio/audioAssets'
import { getPitchAudio, getPitchAudioTransientOutput } from '../audio/pitchAudio'
import { standingWaterSurfaceY, surfaceYAt, worldBaseY } from '../world/worldState'

export type RareEventKind = 'aurora' | 'great-meteor' | 'distant-storm' | 'ground-fog' | 'impossible-star' | 'owl' | 'owl-ufo'

export type RareEventState = {
  kind: RareEventKind
  id: number
}

type LayerProps = {
  event: RareEventState | null
  soundOn?: boolean
  onComplete?: (kind: RareEventKind, id: number) => void
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value))
}

function smoothStep(value: number) {
  const t = clamp01(value)
  return t * t * (3 - 2 * t)
}

function seededFrac(seed: number) {
  const n = Math.sin(seed * 127.1 + 311.7) * 43758.5453123
  return n - Math.floor(n)
}

function hash2D(ix: number, iy: number, seed: number) {
  const n = Math.sin(ix * 127.1 + iy * 311.7 + seed * 74.7) * 43758.5453123
  return n - Math.floor(n)
}

function valueNoise2D(x: number, y: number, seed: number) {
  const ix = Math.floor(x)
  const iy = Math.floor(y)
  const fx0 = x - ix
  const fy0 = y - iy
  const fx = fx0 * fx0 * (3 - 2 * fx0)
  const fy = fy0 * fy0 * (3 - 2 * fy0)
  const v00 = hash2D(ix, iy, seed)
  const v10 = hash2D(ix + 1, iy, seed)
  const v01 = hash2D(ix, iy + 1, seed)
  const v11 = hash2D(ix + 1, iy + 1, seed)
  const a = v00 + (v10 - v00) * fx
  const b = v01 + (v11 - v01) * fx
  return a + (b - a) * fy
}

function fbm1D(x: number, seed: number) {
  let value = 0
  let amplitude = 0.58
  let frequency = 1
  let normalizer = 0
  for (let octave = 0; octave < 4; octave++) {
    value += (valueNoise2D(x * frequency, seed + octave * 0.41, seed + octave * 17.3) * 2 - 1) * amplitude
    normalizer += amplitude
    amplitude *= 0.52
    frequency *= 2.03
  }
  return value / normalizer
}

function fbm2D(x: number, y: number, seed: number) {
  let value = 0
  let amplitude = 0.58
  let frequency = 1
  let normalizer = 0
  for (let octave = 0; octave < 4; octave++) {
    value += (valueNoise2D(x * frequency, y * frequency, seed + octave * 19.3) * 2 - 1) * amplitude
    normalizer += amplitude
    amplitude *= 0.52
    frequency *= 2.03
  }
  return value / normalizer
}

function distantRidgeY(x: number, width: number, height: number, layer: 'far' | 'near') {
  const nx = x / Math.max(1, width)
  if (layer === 'far') {
    return height * (0.686 + fbm1D(nx * 1.45 + 2.8, 183.4) * 0.020 + fbm1D(nx * 3.7 + 8.2, 271.7) * 0.006)
  }
  return height * (0.758 + fbm1D(nx * 1.92 + 5.4, 337.2) * 0.028 + fbm1D(nx * 4.9 + 1.1, 419.6) * 0.008)
}

function drawTree(ctx: CanvasRenderingContext2D, x: number, baseY: number, height: number, alpha: number, lean: number) {
  const half = height * 0.20
  const top = x + lean * height * 0.08
  ctx.beginPath()
  ctx.moveTo(top, baseY - height)
  ctx.lineTo(x - half * 0.30, baseY - height * 0.72)
  ctx.lineTo(x - half * 0.62, baseY - height * 0.49)
  ctx.lineTo(x - half * 0.22, baseY - height * 0.52)
  ctx.lineTo(x - half, baseY - height * 0.18)
  ctx.lineTo(x - half * 0.10, baseY)
  ctx.lineTo(x + half * 0.10, baseY)
  ctx.lineTo(x + half, baseY - height * 0.18)
  ctx.lineTo(x + half * 0.24, baseY - height * 0.52)
  ctx.lineTo(x + half * 0.64, baseY - height * 0.48)
  ctx.lineTo(x + half * 0.32, baseY - height * 0.73)
  ctx.closePath()
  ctx.fillStyle = `rgba(0,1,2,${alpha})`
  ctx.fill()
}

function drawDistantLandscape(ctx: CanvasRenderingContext2D, width: number, height: number, power: number) {
  const reveal = smoothStep(clamp01(power))
  if (reveal < 0.002) return
  const floor = Math.max(height * 0.79, worldBaseY(height) - 7)
  const glow = ctx.createLinearGradient(0, height * 0.50, 0, worldBaseY(height))
  glow.addColorStop(0, 'rgba(160,176,188,0)')
  glow.addColorStop(0.56, `rgba(164,181,193,${0.075 * reveal})`)
  glow.addColorStop(1, `rgba(132,148,160,${0.018 * reveal})`)
  ctx.fillStyle = glow
  ctx.fillRect(0, height * 0.48, width, worldBaseY(height) - height * 0.48)

  const ridge = (layer: 'far' | 'near', fill: string, step: number) => {
    ctx.beginPath()
    ctx.moveTo(0, floor)
    for (let x = 0; x <= width + step; x += step) {
      const px = Math.min(width, x)
      ctx.lineTo(px, distantRidgeY(px, width, height, layer))
    }
    ctx.lineTo(width, floor)
    ctx.closePath()
    ctx.fillStyle = fill
    ctx.fill()
  }

  ridge('far', `rgba(18,23,27,${0.28 * reveal})`, Math.max(12, width / 66))
  ridge('near', `rgba(1,2,3,${0.82 * reveal})`, Math.max(8, width / 90))

  // Same philosophy as the approved depth pass: sparse irregular silhouettes,
  // plenty of empty sky, deterministic placement.
  const clusters = Math.max(3, Math.min(6, Math.round(width / 240)))
  for (let c = 0; c < clusters; c++) {
    const start = width * (0.06 + seededFrac(701 + c * 19.3) * 0.78)
    const span = width * (0.06 + seededFrac(753 + c * 13.7) * 0.12)
    const count = 2 + Math.floor(seededFrac(811 + c * 17.2) * 4)
    for (let i = 0; i < count; i++) {
      const x = Math.max(width * 0.03, Math.min(width * 0.97, start + span * (i / Math.max(1, count - 1)) + (seededFrac(901 + c * 31 + i * 12.7) - 0.5) * span * 0.22))
      const y = distantRidgeY(x, width, height, 'near')
      const treeHeight = (height < 520 ? 8 : 11) + seededFrac(955 + c * 21 + i * 14.4) * (height < 520 ? 12 : 18)
      drawTree(ctx, x, y, treeHeight, 0.92 * reveal, (seededFrac(1007 + c * 27 + i * 17) - 0.5) * 0.55)
    }
  }
}

type AuroraFieldRuntime = {
  canvas: HTMLCanvasElement
  ctx: CanvasRenderingContext2D
  image: ImageData
  width: number
  height: number
  lastUpdate: number
}

function createAuroraField(viewWidth: number, viewHeight: number): AuroraFieldRuntime {
  const width = Math.max(112, Math.min(224, Math.round(viewWidth / 7)))
  const skyHeight = Math.max(1, viewHeight * 0.80)
  const height = Math.max(64, Math.min(132, Math.round(width * skyHeight / Math.max(1, viewWidth))))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const fieldCtx = canvas.getContext('2d', { alpha: true })
  if (!fieldCtx) throw new Error('Unable to create aurora field canvas')
  return {
    canvas,
    ctx: fieldCtx,
    image: fieldCtx.createImageData(width, height),
    width,
    height,
    lastUpdate: -Infinity,
  }
}

function renderAuroraField(field: AuroraFieldRuntime, elapsed: number) {
  // Intentionally update this soft light field well below display refresh. The
  // browser's bilinear upscale provides the final diffusion without a blur pass.
  if (elapsed - field.lastUpdate < 68) return
  field.lastUpdate = elapsed

  const t = elapsed * 0.0000105
  const data = field.image.data
  const w = field.width
  const h = field.height

  for (let y = 0; y < h; y++) {
    const ny = y / Math.max(1, h - 1)
    const topEnvelope = smoothStep((ny - 0.015) / 0.085)
    const altitudeFade = 1 - smoothStep((ny - 0.78) / 0.20)
    const upperColour = 1 - smoothStep((ny - 0.34) / 0.34)

    for (let x = 0; x < w; x++) {
      const nx = x / Math.max(1, w - 1)

      // Multiple very slow domain warps make the same folds lean, gather and
      // dissolve together. Nothing here defines an individual ribbon/path.
      const broadWarp = (valueNoise2D(nx * 1.55 + t * 0.31, ny * 0.82 - t * 0.08, 72.4) - 0.5) * 1.85
      const fineWarp = (valueNoise2D(nx * 3.7 - t * 0.18, ny * 1.6 + t * 0.11, 118.7) - 0.5) * 0.72
      const foldedX = nx * 9.1 + broadWarp + fineWarp
      const foldNoise = valueNoise2D(foldedX, ny * 0.72 + t * 0.25, 201.8)
      const foldNoise2 = valueNoise2D(foldedX * 0.54 + 4.8, ny * 1.12 - t * 0.17, 267.1)
      const ridge = Math.pow(clamp01(1 - Math.abs(foldNoise * 2 - 1) * 1.62), 1.72)
      const secondaryRidge = Math.pow(clamp01(1 - Math.abs(foldNoise2 * 2 - 1) * 1.78), 2.25)

      const presence = smoothStep((valueNoise2D(nx * 1.38 + t * 0.12, ny * 0.42, 331.6) - 0.27) / 0.54)
      const breath = 0.70 + valueNoise2D(nx * 2.1 - t * 0.10, ny * 0.68 + t * 0.07, 390.3) * 0.42
      const reach = 0.50 + valueNoise2D(nx * 1.72 + t * 0.08, 0.31 + t * 0.03, 443.9) * 0.34
      const lowerEnvelope = 1 - smoothStep((ny - reach) / 0.16)
      const body = clamp01((ridge * 0.76 + secondaryRidge * 0.31) * presence * breath)
      const alpha = Math.pow(body, 1.18) * topEnvelope * lowerEnvelope * altitudeFade

      // Magenta/violet exists only as a restrained high-altitude variation
      // inside the same field, never as a separate coloured ribbon.
      const violetNoise = smoothStep((valueNoise2D(nx * 2.32 + t * 0.06, ny * 0.75 - t * 0.05, 517.2) - 0.58) / 0.25)
      const violet = violetNoise * upperColour * (0.18 + secondaryRidge * 0.48)
      const greenLift = 0.62 + ridge * 0.38

      const i = (y * w + x) * 4
      data[i] = Math.round(92 + violet * 94 + greenLift * 10)
      data[i + 1] = Math.round(178 - violet * 52 + greenLift * 48)
      data[i + 2] = Math.round(132 + violet * 96 + secondaryRidge * 18)
      data[i + 3] = Math.round(clamp01(alpha) * 92)
    }
  }

  field.ctx.putImageData(field.image, 0, 0)
}

function drawAurora(
  ctx: CanvasRenderingContext2D,
  field: AuroraFieldRuntime,
  width: number,
  height: number,
  elapsed: number,
) {
  const fadeIn = smoothStep(elapsed / 18_000)
  const sustainOut = 1 - smoothStep((elapsed - 78_000) / 16_000)
  const strength = clamp01(fadeIn * sustainOut)
  if (strength <= 0) return

  renderAuroraField(field, elapsed)

  const skyBottom = height * 0.82
  ctx.save()
  ctx.globalCompositeOperation = 'screen'
  ctx.globalAlpha = strength
  ctx.imageSmoothingEnabled = true
  ctx.drawImage(field.canvas, 0, 0, width, skyBottom)

  // One extremely broad atmospheric veil helps the pixel field belong to the
  // sky. It has no readable geometry and never defines the curtain structure.
  const veil = ctx.createRadialGradient(width * 0.50, height * 0.43, 0, width * 0.50, height * 0.43, width * 0.67)
  veil.addColorStop(0, `rgba(116, 208, 139, ${0.026 * strength})`)
  veil.addColorStop(0.48, `rgba(147, 188, 153, ${0.010 * strength})`)
  veil.addColorStop(1, 'rgba(116, 208, 139, 0)')
  ctx.fillStyle = veil
  ctx.fillRect(0, height * 0.03, width, height * 0.76)
  ctx.restore()
}

type MeteorPoint = {
  x: number
  y: number
}

type MeteorVector = {
  x: number
  y: number
}

const GREAT_METEOR_FLIGHT_MS = 4_700
const GREAT_METEOR_TRAIL_MS = 4_850

function meteorTerrainYAt(x: number, width: number, height: number) {
  const surface = surfaceYAt(x, width, height)
  return Number.isFinite(surface) ? surface : worldBaseY(height)
}

function clipMeteorToSky(ctx: CanvasRenderingContext2D, width: number, height: number) {
  const step = Math.max(6, Math.round(width / 220))
  ctx.beginPath()
  ctx.moveTo(0, 0)
  ctx.lineTo(width, 0)
  for (let x = width; x >= 0; x -= step) {
    ctx.lineTo(x, meteorTerrainYAt(x, width, height))
  }
  ctx.lineTo(0, meteorTerrainYAt(0, width, height))
  ctx.closePath()
  ctx.clip()
}

function meteorPointAt(width: number, height: number, flightTime: number): MeteorPoint {
  const burialDepth = Math.max(44, height * 0.058)
  const horizon = worldBaseY(height) + burialDepth
  const p = flightTime / GREAT_METEOR_FLIGHT_MS
  const sx = -width * 0.15
  const sy = height * 0.12
  const ex = width * 0.84
  const ey = horizon
  const acceleration = height * 0.082

  // Forward momentum stays constant while gravity pulls the bolide decisively
  // down through the live horizon. The endpoint is intentionally well behind
  // the world so there is no possible visible skim or stop above the terrain.
  return {
    x: sx + (ex - sx) * p,
    y: sy + (ey - sy - acceleration) * p + acceleration * p * p,
  }
}

function meteorVelocityAt(width: number, height: number, flightTime: number): MeteorVector {
  const burialDepth = Math.max(44, height * 0.058)
  const horizon = worldBaseY(height) + burialDepth
  const p = flightTime / GREAT_METEOR_FLIGHT_MS
  const sx = -width * 0.15
  const sy = height * 0.12
  const ex = width * 0.84
  const ey = horizon
  const acceleration = height * 0.082
  const dxdp = ex - sx
  const dydp = ey - sy - acceleration + 2 * acceleration * p
  return {
    x: dxdp / GREAT_METEOR_FLIGHT_MS,
    y: dydp / GREAT_METEOR_FLIGHT_MS,
  }
}

function meteorOffsetAt(sampleTime: number, age: number, height: number) {
  const ageSeconds = age / 1000
  const spread = Math.pow(clamp01(age / GREAT_METEOR_TRAIL_MS), 0.88)
  const swirl = Math.sin(sampleTime * 0.0021 + 1.8) * 0.46 + Math.sin(sampleTime * 0.0068 + 0.7) * 0.15
  const lift = 0.22 + Math.sin(sampleTime * 0.0013 + 0.35) * 0.06 + Math.sin(sampleTime * 0.0049) * 0.02
  return {
    x: swirl * Math.pow(ageSeconds, 1.12) * 0.60,
    y: -Math.pow(ageSeconds, 1.14) * lift * 0.66 - spread * height * 0.00072,
  }
}

function meteorRenderedPointAt(width: number, height: number, sampleTime: number, age: number): MeteorPoint {
  const point = meteorPointAt(width, height, sampleTime)
  const offset = meteorOffsetAt(sampleTime, age, height)
  return {
    x: point.x + offset.x,
    y: point.y + offset.y,
  }
}

function drawGreatMeteor(ctx: CanvasRenderingContext2D, width: number, height: number, elapsed: number) {
  const start = 1_250
  const flightDuration = GREAT_METEOR_FLIGHT_MS
  const trailLife = GREAT_METEOR_TRAIL_MS
  const t = elapsed - start
  if (t < 0 || t > flightDuration + trailLife) return

  const headVisible = t <= flightDuration
  const sampleSpacing = 20
  const youngestSample = Math.min(t, flightDuration)
  const oldestSample = Math.max(0, youngestSample - trailLife)

  ctx.save()
  // This is the important physical rule for the event: the meteor exists only
  // in the sky. Snow, standing water and permanent ground all occlude it using
  // the same live world surface the weather systems use.
  clipMeteorToSky(ctx, width, height)
  ctx.globalCompositeOperation = 'screen'
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  const samples: Array<{ age: number; point: MeteorPoint }> = []
  for (let sampleTime = oldestSample; sampleTime <= youngestSample + 0.01; sampleTime += sampleSpacing) {
    const age = t - sampleTime
    samples.push({
      age,
      point: meteorRenderedPointAt(width, height, sampleTime, age),
    })
  }

  const tracePath = (maxAge: number) => {
    let first = 0
    while (first < samples.length && samples[first].age > maxAge) first++
    if (samples.length - first < 2) return null

    ctx.beginPath()
    ctx.moveTo(samples[first].point.x, samples[first].point.y)
    for (let i = first + 1; i < samples.length - 1; i++) {
      const current = samples[i].point
      const next = samples[i + 1].point
      ctx.quadraticCurveTo(current.x, current.y, (current.x + next.x) * 0.5, (current.y + next.y) * 0.5)
    }
    const last = samples[samples.length - 1].point
    ctx.lineTo(last.x, last.y)
    return { start: samples[first].point, end: last }
  }

  if (samples.length >= 2) {
    // Three continuous strokes are enough: soft atmosphere, luminous body and
    // a short hot front. No stitched per-segment styling is visible anymore.
    const wakePath = tracePath(trailLife)
    if (wakePath) {
      const gradient = ctx.createLinearGradient(wakePath.start.x, wakePath.start.y, wakePath.end.x, wakePath.end.y)
      gradient.addColorStop(0, 'rgba(148,174,198,0.006)')
      gradient.addColorStop(0.50, 'rgba(174,199,220,0.032)')
      gradient.addColorStop(1, 'rgba(211,225,236,0.105)')
      ctx.strokeStyle = gradient
      ctx.lineWidth = 8.8
      ctx.stroke()
    }

    const bodyPath = tracePath(3_500)
    if (bodyPath) {
      const gradient = ctx.createLinearGradient(bodyPath.start.x, bodyPath.start.y, bodyPath.end.x, bodyPath.end.y)
      gradient.addColorStop(0, 'rgba(194,211,225,0.020)')
      gradient.addColorStop(0.48, 'rgba(221,231,238,0.18)')
      gradient.addColorStop(0.80, 'rgba(248,231,207,0.46)')
      gradient.addColorStop(1, 'rgba(255,238,207,0.76)')
      ctx.strokeStyle = gradient
      ctx.lineWidth = 3.4
      ctx.stroke()
    }

    const hotPath = headVisible ? tracePath(1_050) : null
    if (hotPath) {
      const gradient = ctx.createLinearGradient(hotPath.start.x, hotPath.start.y, hotPath.end.x, hotPath.end.y)
      gradient.addColorStop(0, 'rgba(246,223,196,0.035)')
      gradient.addColorStop(0.54, 'rgba(255,219,165,0.28)')
      gradient.addColorStop(1, 'rgba(255,246,222,0.94)')
      ctx.strokeStyle = gradient
      ctx.lineWidth = 4.6
      ctx.stroke()
    }
  }

  // Fragmentation stays subordinate to the main body: a few tiny pieces peel
  // away, enough to imply violence without turning the event into particles.
  const fragmentTimes = [2_780, 3_540, 4_020]
  for (let i = 0; i < fragmentTimes.length; i++) {
    const born = fragmentTimes[i]
    const age = t - born
    if (age < 0 || age > 1_420) continue

    const base = meteorPointAt(width, height, Math.min(born + age * 0.90, flightDuration))
    const before = meteorPointAt(width, height, Math.max(0, born - 80))
    const after = meteorPointAt(width, height, Math.min(flightDuration, born + 80))
    const dx = after.x - before.x
    const dy = after.y - before.y
    const mag = Math.max(1, Math.hypot(dx, dy))
    const nx = -dy / mag
    const ny = dx / mag
    const side = i % 2 === 0 ? 1 : -1
    const separation = (age / 1000) * (1.7 + i * 0.95) * side
    const gravity = Math.pow(age / 1000, 2) * height * (0.0020 + i * 0.00035)
    const fx = base.x + nx * separation
    const fy = base.y + ny * separation + gravity
    const fragLife = clamp01(1 - age / 1_420)

    const tailMs = Math.min(190, age)
    if (tailMs > 30) {
      const tailBase = meteorPointAt(width, height, Math.max(0, born + (age - tailMs) * 0.90))
      ctx.beginPath()
      ctx.moveTo(tailBase.x + nx * separation * 0.48, tailBase.y + ny * separation * 0.48)
      ctx.lineTo(fx, fy)
      ctx.strokeStyle = `rgba(233,224,213,${0.085 * fragLife})`
      ctx.lineWidth = 0.40 + i * 0.04
      ctx.stroke()
    }

    const halo = ctx.createRadialGradient(fx, fy, 0, fx, fy, 3.3 + i * 0.22)
    halo.addColorStop(0, `rgba(255,229,199,${0.085 * fragLife})`)
    halo.addColorStop(1, 'rgba(188,220,242,0)')
    ctx.fillStyle = halo
    ctx.beginPath()
    ctx.arc(fx, fy, 3.3 + i * 0.22, 0, Math.PI * 2)
    ctx.fill()

    ctx.beginPath()
    ctx.arc(fx, fy, 0.54 + i * 0.04, 0, Math.PI * 2)
    ctx.fillStyle = `rgba(250,241,230,${0.40 * fragLife})`
    ctx.fill()
  }

  // The ionized train is aftermath only. It hangs where the bolide passed and
  // slowly diffuses while the head is already hidden behind the landscape.
  const trainAfter = t - flightDuration
  if (trainAfter > 0) {
    const trainFade = clamp01(1 - trainAfter / 1_900)
    if (trainFade > 0) {
      ctx.beginPath()
      let began = false
      const trainStart = Math.max(0, flightDuration - 1_850)
      for (let sampleTime = trainStart; sampleTime <= flightDuration; sampleTime += 56) {
        const age = trainAfter + (flightDuration - sampleTime)
        const point = meteorRenderedPointAt(width, height, sampleTime, age)
        const wobble = Math.sin(sampleTime * 0.0055 + trainAfter * 0.004) * (1.0 + trainAfter / 500)
        if (!began) {
          ctx.moveTo(point.x + wobble * 0.18, point.y - wobble * 0.05)
          began = true
        } else {
          ctx.lineTo(point.x + wobble * 0.18, point.y - wobble * 0.05)
        }
      }
      ctx.strokeStyle = `rgba(197,211,224,${0.082 * trainFade})`
      ctx.lineWidth = 2.7 + (1 - trainFade) * 2.5
      ctx.stroke()
    }
  }

  if (headVisible) {
    const head = meteorRenderedPointAt(width, height, t, 0)
    const velocity = meteorVelocityAt(width, height, t)
    const mag = Math.max(0.0001, Math.hypot(velocity.x, velocity.y))
    const dirX = velocity.x / mag
    const dirY = velocity.y / mag
    const phase = clamp01(t / flightDuration)
    const burn = 0.80 + Math.sin(Math.min(1, phase * 1.12) * Math.PI) * 0.20

    // A very broad, barely-there bloom gives the fireball atmospheric scale.
    const atmosphereGlow = ctx.createRadialGradient(head.x, head.y, 0, head.x, head.y, 74)
    atmosphereGlow.addColorStop(0, `rgba(255,208,151,${0.044 * burn})`)
    atmosphereGlow.addColorStop(0.34, `rgba(235,195,158,${0.020 * burn})`)
    atmosphereGlow.addColorStop(1, 'rgba(196,214,230,0)')
    ctx.fillStyle = atmosphereGlow
    ctx.beginPath()
    ctx.arc(head.x, head.y, 74, 0, Math.PI * 2)
    ctx.fill()

    // The head is deliberately substantial: a short incandescent shoulder
    // joins the trail into a compact fireball rather than a dot-on-a-line.
    ctx.beginPath()
    ctx.moveTo(head.x - dirX * 34, head.y - dirY * 34)
    ctx.lineTo(head.x, head.y)
    ctx.strokeStyle = `rgba(255,218,163,${0.34 * burn})`
    ctx.lineWidth = 5.2
    ctx.stroke()

    const glow = ctx.createRadialGradient(head.x, head.y, 0, head.x, head.y, 27)
    glow.addColorStop(0, `rgba(255,254,244,${0.90 * burn})`)
    glow.addColorStop(0.12, `rgba(255,239,207,${0.72 * burn})`)
    glow.addColorStop(0.30, `rgba(255,211,151,${0.42 * burn})`)
    glow.addColorStop(0.58, `rgba(241,185,129,${0.16 * burn})`)
    glow.addColorStop(0.82, `rgba(194,218,237,${0.055 * burn})`)
    glow.addColorStop(1, 'rgba(159,211,247,0)')
    ctx.fillStyle = glow
    ctx.beginPath()
    ctx.arc(head.x, head.y, 27, 0, Math.PI * 2)
    ctx.fill()

    ctx.beginPath()
    ctx.arc(head.x, head.y, 5.1 + burn * 0.9, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(255,238,208,0.98)'
    ctx.fill()

    ctx.beginPath()
    ctx.arc(head.x, head.y, 2.3 + burn * 0.35, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(255,255,251,0.99)'
    ctx.fill()
  }

  // A tiny glow sits just above the place where the bolide disappears. Because
  // the entire event is sky-clipped, this cannot paint over the foreground.
  const horizonMoment = flightDuration - 370
  const horizonFlash = clamp01(1 - Math.abs(t - horizonMoment) / 420)
  if (horizonFlash > 0) {
    const impact = meteorPointAt(width, height, horizonMoment)
    const terrainY = meteorTerrainYAt(impact.x, width, height)
    const glow = ctx.createRadialGradient(impact.x, terrainY - 2, 0, impact.x, terrainY - 2, width * 0.082)
    glow.addColorStop(0, `rgba(241,207,169,${0.048 * horizonFlash})`)
    glow.addColorStop(0.38, `rgba(163,181,199,${0.014 * horizonFlash})`)
    glow.addColorStop(1, 'rgba(132,154,176,0)')
    ctx.fillStyle = glow
    ctx.fillRect(impact.x - width * 0.082, terrainY - height * 0.055, width * 0.164, height * 0.07)
  }

  // Peak burn still lifts the world by only a few percent: enough for scale,
  // never enough to turn the rare event into a flash effect.
  const flash = Math.max(0, 1 - Math.abs(t - 3_420) / 980)
  if (flash > 0) {
    const gradient = ctx.createLinearGradient(0, height * 0.54, 0, height)
    gradient.addColorStop(0, 'rgba(176,188,197,0)')
    gradient.addColorStop(1, `rgba(183,190,194,${0.027 * flash})`)
    ctx.fillStyle = gradient
    ctx.fillRect(0, height * 0.52, width, height * 0.48)
  }

  ctx.restore()
}

function drawImpossibleStar(ctx: CanvasRenderingContext2D, width: number, height: number, elapsed: number) {
  const total = 32_000
  if (elapsed < 0 || elapsed > total) return
  const startX = width * 0.73
  const startY = height * 0.18
  let x = startX
  let y = startY
  let alpha = 0.62
  let trail = 0

  if (elapsed < 11_000) {
    const p = elapsed / 11_000
    x += width * 0.105 * p
    y += height * 0.038 * p
  } else if (elapsed < 18_000) {
    x += width * 0.105
    y += height * 0.038
    alpha *= 0.92 + Math.sin(elapsed * 0.003) * 0.08
  } else if (elapsed < 27_000) {
    const p = (elapsed - 18_000) / 9_000
    x += width * (0.105 - 0.072 * p)
    y += height * (0.038 - 0.085 * p)
  } else {
    const p = smoothStep((elapsed - 27_000) / 5_000)
    x += width * (0.033 - 0.48 * p)
    y += height * (-0.047 - 0.32 * p)
    alpha *= 1 - p * 0.82
    trail = p
  }

  if (trail > 0.01) {
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(x + width * 0.045 * trail, y + height * 0.035 * trail)
    ctx.strokeStyle = `rgba(215,226,232,${0.12 * trail})`
    ctx.lineWidth = 0.7
    ctx.stroke()
  }

  ctx.beginPath()
  ctx.arc(x, y, 1.05, 0, Math.PI * 2)
  ctx.fillStyle = `rgba(229,235,238,${alpha})`
  ctx.fill()
  ctx.beginPath()
  ctx.arc(x, y, 3.2, 0, Math.PI * 2)
  ctx.fillStyle = `rgba(196,211,220,${alpha * 0.07})`
  ctx.fill()
}

function owlBlinkOpen(elapsed: number, center: number, halfWidth: number) {
  const distance = Math.abs(elapsed - center)
  if (distance >= halfWidth) return 1
  return smoothStep(distance / halfWidth)
}

function drawOwl(ctx: CanvasRenderingContext2D, width: number, height: number, elapsed: number, id: number) {
  const duration = 9_600
  if (elapsed < 0 || elapsed > duration) return

  const fadeIn = smoothStep(elapsed / 1_050)
  const fadeOut = 1 - smoothStep((elapsed - 7_350) / 1_650)
  const presence = clamp01(fadeIn * fadeOut)
  if (presence <= 0) return

  // Keep the sighting away from dead-centre so it feels discovered rather than
  // presented. The eyes sit just above the live local terrain, not at a fixed
  // screen coordinate, so snow/water aftermath still belongs to the world.
  const leftSide = seededFrac(id * 17.3 + 3.2) < 0.5
  const xBand = seededFrac(id * 11.7 + 8.4)
  const centerX = width * (leftSide ? 0.17 + xBand * 0.20 : 0.63 + xBand * 0.20)
  const terrainY = surfaceYAt(centerX, width, height)
  const perchLift = 17 + seededFrac(id * 23.9 + 1.7) * 15
  const shift = smoothStep((elapsed - 4_550) / 700)
  const centerY = Math.min(height * 0.77, terrainY - perchLift - shift * 0.8)
  const spacing = Math.max(9.5, Math.min(15.5, width * 0.0105))
  const eyeRadiusX = Math.max(1.8, Math.min(2.8, width * 0.0020))
  const eyeRadiusY = eyeRadiusX * 0.67

  // Two slightly imperfect blinks. The tiny left/right offset prevents them
  // from reading like synchronized UI indicators.
  const firstLeft = owlBlinkOpen(elapsed, 2_920, 175)
  const firstRight = owlBlinkOpen(elapsed, 2_965, 168)
  const secondLeft = owlBlinkOpen(elapsed, 4_410, 190)
  const secondRight = owlBlinkOpen(elapsed, 4_355, 184)
  const leftOpen = Math.max(0.025, firstLeft * secondLeft)
  const rightOpen = Math.max(0.025, firstRight * secondRight)
  const breath = 0.91 + Math.sin(elapsed * 0.0021 + id * 0.37) * 0.09
  const alpha = presence * breath

  const drawEye = (x: number, openness: number, bias: number) => {
    const yRadius = eyeRadiusY * openness
    if (yRadius < 0.06) return

    const glowRadius = 5.2 + eyeRadiusX * 1.6
    const glow = ctx.createRadialGradient(x, centerY, 0, x, centerY, glowRadius)
    glow.addColorStop(0, `rgba(232,190,92,${0.17 * alpha * openness})`)
    glow.addColorStop(0.38, `rgba(197,146,63,${0.075 * alpha * openness})`)
    glow.addColorStop(1, 'rgba(166,119,51,0)')
    ctx.fillStyle = glow
    ctx.beginPath()
    ctx.arc(x, centerY, glowRadius, 0, Math.PI * 2)
    ctx.fill()

    ctx.beginPath()
    ctx.ellipse(x, centerY, eyeRadiusX * (1 + bias), yRadius, 0, 0, Math.PI * 2)
    ctx.fillStyle = `rgba(224,177,78,${0.78 * alpha})`
    ctx.fill()

    ctx.beginPath()
    ctx.ellipse(x + eyeRadiusX * 0.12, centerY - yRadius * 0.10, eyeRadiusX * 0.34, Math.max(0.12, yRadius * 0.42), 0, 0, Math.PI * 2)
    ctx.fillStyle = `rgba(255,226,143,${0.52 * alpha * openness})`
    ctx.fill()
  }

  ctx.save()
  ctx.globalCompositeOperation = 'screen'
  drawEye(centerX - spacing * 0.5 + shift * 0.55, leftOpen, -0.035)
  drawEye(centerX + spacing * 0.5 + shift * 0.72, rightOpen, 0.025)
  ctx.restore()
}


function drawOwlUfo(ctx: CanvasRenderingContext2D, width: number, height: number, elapsed: number, id: number) {
  const duration = 15_600
  if (elapsed < 0 || elapsed > duration) return

  const leftSide = seededFrac(id * 17.3 + 3.2) < 0.5
  const xBand = seededFrac(id * 11.7 + 8.4)
  const perchX = width * (leftSide ? 0.17 + xBand * 0.20 : 0.63 + xBand * 0.20)
  const terrainY = surfaceYAt(perchX, width, height)
  const perchLift = 17 + seededFrac(id * 23.9 + 1.7) * 15
  const baseY = Math.min(height * 0.77, terrainY - perchLift)

  const hoverX = Math.max(width * 0.10, Math.min(width * 0.90, perchX + (leftSide ? width * 0.018 : -width * 0.018)))
  const hoverY = Math.max(height * 0.13, Math.min(height * 0.43, baseY - Math.max(88, height * 0.19)))
  const entryFromRight = !leftSide
  const entryX = entryFromRight ? width * 1.08 : -width * 0.08
  const entryY = height * (0.14 + seededFrac(id * 31.1 + 9.7) * 0.12)

  const arrival = smoothStep((elapsed - 6_850) / 2_150)
  const hoverDrift = Math.sin((elapsed - 7_800) * 0.00145 + id * 0.17) * Math.min(2.6, height * 0.004)
  let saucerX = entryX + (hoverX - entryX) * arrival
  let saucerY = entryY + (hoverY - entryY) * arrival + hoverDrift

  const zip = smoothStep((elapsed - 12_000) / 1_550)
  const zipAccel = zip * zip
  if (zip > 0) {
    const exitDirection = leftSide ? -1 : 1
    saucerX += exitDirection * width * 0.90 * zipAccel
    saucerY -= height * 0.60 * zipAccel
  }

  const saucerFadeIn = smoothStep((elapsed - 6_650) / 850)
  const saucerFadeOut = 1 - smoothStep((elapsed - 13_050) / 850)
  const saucerAlpha = clamp01(saucerFadeIn * saucerFadeOut)

  const beamIn = smoothStep((elapsed - 8_850) / 650)
  const beamOut = 1 - smoothStep((elapsed - 11_520) / 520)
  const beamStrength = clamp01(beamIn * beamOut * (1 - zip))
  const lift = smoothStep((elapsed - 9_150) / 2_450)
  const owlTargetY = saucerY + Math.max(14, height * 0.028)
  const owlY = baseY + (owlTargetY - baseY) * lift
  const owlX = perchX + (saucerX - perchX) * lift * 0.92

  if (beamStrength > 0.001) {
    const beamTopY = saucerY + Math.max(4, height * 0.006)
    const beamBottomY = Math.min(terrainY + 2, owlY + Math.max(24, height * 0.055))
    const topHalf = Math.max(4.5, width * 0.004)
    const bottomHalf = Math.max(14, width * 0.017)
    const beam = ctx.createLinearGradient(0, beamTopY, 0, beamBottomY)
    beam.addColorStop(0, `rgba(176,207,222,${0.055 * beamStrength})`)
    beam.addColorStop(0.55, `rgba(162,198,216,${0.035 * beamStrength})`)
    beam.addColorStop(1, 'rgba(152,190,209,0)')
    ctx.fillStyle = beam
    ctx.beginPath()
    ctx.moveTo(saucerX - topHalf, beamTopY)
    ctx.lineTo(saucerX + topHalf, beamTopY)
    ctx.lineTo(owlX + bottomHalf, beamBottomY)
    ctx.lineTo(owlX - bottomHalf, beamBottomY)
    ctx.closePath()
    ctx.fill()

  }

  // Keep the owl identical in spirit to the accepted sighting: two imperfect,
  // warm points with the same blinks. During the beam they simply leave the perch.
  const owlFadeIn = smoothStep(elapsed / 1_050)
  const owlFadeOut = 1 - smoothStep((elapsed - 11_650) / 850)
  const owlPresence = clamp01(owlFadeIn * owlFadeOut)
  if (owlPresence > 0) {
    // As the owl is lifted toward the distant craft, let the eyes recede in
    // perspective rather than staying screen-sized all the way up.
    const perspectiveScale = 1 - lift * 0.44
    const spacing = Math.max(9.5, Math.min(15.5, width * 0.0105)) * perspectiveScale
    const eyeRadiusX = Math.max(1.8, Math.min(2.8, width * 0.0020)) * perspectiveScale
    const eyeRadiusY = eyeRadiusX * 0.67
    const firstLeft = owlBlinkOpen(elapsed, 2_920, 175)
    const firstRight = owlBlinkOpen(elapsed, 2_965, 168)
    const secondLeft = owlBlinkOpen(elapsed, 4_410, 190)
    const secondRight = owlBlinkOpen(elapsed, 4_355, 184)
    const leftOpen = Math.max(0.025, firstLeft * secondLeft)
    const rightOpen = Math.max(0.025, firstRight * secondRight)
    const breath = 0.91 + Math.sin(elapsed * 0.0021 + id * 0.37) * 0.09
    const alpha = owlPresence * breath

    const drawEye = (x: number, openness: number, bias: number) => {
      const yRadius = eyeRadiusY * openness
      if (yRadius < 0.06) return
      const glowRadius = 5.2 + eyeRadiusX * 1.6
      const glow = ctx.createRadialGradient(x, owlY, 0, x, owlY, glowRadius)
      glow.addColorStop(0, `rgba(232,190,92,${0.17 * alpha * openness})`)
      glow.addColorStop(0.38, `rgba(197,146,63,${0.075 * alpha * openness})`)
      glow.addColorStop(1, 'rgba(166,119,51,0)')
      ctx.fillStyle = glow
      ctx.beginPath()
      ctx.arc(x, owlY, glowRadius, 0, Math.PI * 2)
      ctx.fill()

      ctx.beginPath()
      ctx.ellipse(x, owlY, eyeRadiusX * (1 + bias), yRadius, 0, 0, Math.PI * 2)
      ctx.fillStyle = `rgba(224,177,78,${0.78 * alpha})`
      ctx.fill()

      ctx.beginPath()
      ctx.ellipse(x + eyeRadiusX * 0.12, owlY - yRadius * 0.10, eyeRadiusX * 0.34, Math.max(0.12, yRadius * 0.42), 0, 0, Math.PI * 2)
      ctx.fillStyle = `rgba(255,226,143,${0.52 * alpha * openness})`
      ctx.fill()
    }

    ctx.save()
    ctx.globalCompositeOperation = 'screen'
    drawEye(owlX - spacing * 0.5, leftOpen, -0.035)
    drawEye(owlX + spacing * 0.5, rightOpen, 0.025)
    ctx.restore()
  }

  if (saucerAlpha > 0.001) {
    const scale = Math.max(0.72, Math.min(1.22, width / 1100))
    const saucerW = 34 * scale
    const saucerH = 8.4 * scale
    ctx.save()
    ctx.translate(saucerX, saucerY)
    ctx.rotate((entryFromRight ? -1 : 1) * 0.012 + Math.sin(elapsed * 0.0011) * 0.006)

    // Mostly-black craft: it is discovered through the faint cold rim and tiny
    // under-lights rather than presented as a bright sci-fi prop.
    ctx.fillStyle = `rgba(5,8,11,${0.94 * saucerAlpha})`
    ctx.beginPath()
    ctx.ellipse(0, 0, saucerW * 0.50, saucerH * 0.50, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = `rgba(11,15,19,${0.88 * saucerAlpha})`
    ctx.beginPath()
    ctx.ellipse(0, -saucerH * 0.22, saucerW * 0.22, saucerH * 0.36, 0, Math.PI, Math.PI * 2)
    ctx.fill()

    ctx.strokeStyle = `rgba(151,177,191,${0.18 * saucerAlpha})`
    ctx.lineWidth = 0.55
    ctx.beginPath()
    ctx.ellipse(0, 0, saucerW * 0.50, saucerH * 0.50, 0, 0, Math.PI * 2)
    ctx.stroke()

    const lampAlpha = 0.19 * saucerAlpha * (0.84 + Math.sin(elapsed * 0.0032) * 0.16)
    for (const dx of [-0.22, 0, 0.22]) {
      ctx.beginPath()
      ctx.arc(saucerW * dx, saucerH * 0.30, Math.max(0.55, scale * 0.62), 0, Math.PI * 2)
      ctx.fillStyle = `rgba(168,204,220,${lampAlpha})`
      ctx.fill()
    }
    ctx.restore()
  }
}

function drawDistantStorm(ctx: CanvasRenderingContext2D, width: number, height: number, elapsed: number, id: number) {
  const duration = 72_000
  const fade = smoothStep(Math.min(elapsed / 8_000, (duration - elapsed) / 10_000))
  if (fade <= 0) return

  // Deterministic pulse schedule per trigger: no local bolt, only off-screen weather.
  const pulses = [7_000, 15_800, 26_500, 38_100, 51_000, 63_000]
  let reveal = 0
  for (let i = 0; i < pulses.length; i++) {
    const jitter = (seededFrac(id * 13.1 + i * 5.7) - 0.5) * 2_000
    const age = elapsed - (pulses[i] + jitter)
    if (age < 0 || age > 1_900) continue
    const first = Math.exp(-Math.pow((age - 120) / 105, 2))
    const second = Math.exp(-Math.pow((age - 430) / 150, 2)) * 0.54
    const echo = Math.exp(-Math.pow((age - 950) / 310, 2)) * 0.17
    reveal = Math.max(reveal, first, second, echo)
  }

  if (reveal > 0.002) {
    drawDistantLandscape(ctx, width, height, reveal * fade)
    const rainCurtain = ctx.createLinearGradient(width * 0.58, height * 0.50, width * 0.58, height * 0.76)
    rainCurtain.addColorStop(0, `rgba(138,153,165,${0.018 * reveal})`)
    rainCurtain.addColorStop(1, 'rgba(138,153,165,0)')
    ctx.fillStyle = rainCurtain
    const curtainX = width * (0.53 + seededFrac(id * 7.4) * 0.14)
    ctx.fillRect(curtainX, height * 0.50, width * 0.15, height * 0.27)
  }
}

function playMeteorBoom(soundOn: boolean) {
  if (!soundOn) return
  const ac = getPitchAudio()
  if (!ac) return

  const duration = 6.8
  const buffer = ac.createBuffer(1, Math.floor(ac.sampleRate * duration), ac.sampleRate)
  const data = buffer.getChannelData(0)
  let low = 0
  let sub = 0
  for (let i = 0; i < data.length; i++) {
    const t = i / ac.sampleRate
    const white = Math.random() * 2 - 1
    low = low * 0.992 + white * 0.008
    sub = sub * 0.998 + white * 0.002
    const attack = Math.min(1, t / 0.20)
    const decay = Math.exp(-t / 3.4)
    const roll = 0.76 + Math.sin(t * 2.4) * 0.15 + Math.sin(t * 0.73 + 1.2) * 0.09
    data[i] = (low * 0.52 + sub * 0.50 + white * 0.018) * attack * decay * roll
  }

  const source = ac.createBufferSource()
  const filter = ac.createBiquadFilter()
  const gain = ac.createGain()
  source.buffer = buffer
  filter.type = 'lowpass'
  filter.frequency.value = 165
  gain.gain.value = 0.095
  source.connect(filter).connect(gain).connect(getPitchAudioTransientOutput(ac))
  source.start()
}

function playOwlCall(soundOn: boolean, eventId: number) {
  if (!soundOn) return
  const ac = getPitchAudio()
  if (!ac) return

  // Real field recording: choose one of several naturally separated call clusters
  // rather than replaying the exact same hoot every sighting. The visual timing stays
  // unchanged; only the voice of the owl has moved from synthesis to recorded sound.
  const callSlices = [
    { offset: 1.0, duration: 6.2 },
    { offset: 14.0, duration: 4.1 },
    { offset: 22.9, duration: 4.4 },
    { offset: 39.0, duration: 4.8 },
    { offset: 45.1, duration: 3.7 },
    { offset: 51.0, duration: 5.5 },
  ]
  const slice = callSlices[Math.abs(eventId) % callSlices.length]

  void loadPitchAudioAsset(ac, 'owl-field.mp3')
    .then((buffer) => {
      if (ac.state === 'closed') return
      const duration = Math.min(slice.duration, Math.max(0.5, buffer.duration - slice.offset - 0.05))
      if (duration <= 0.2) return

      const source = ac.createBufferSource()
      const filter = ac.createBiquadFilter()
      const gain = ac.createGain()
      const output = getPitchAudioTransientOutput(ac)
      source.buffer = buffer
      filter.type = 'lowpass'
      filter.frequency.value = 4200
      filter.Q.value = 0.22

      const now = ac.currentTime
      gain.gain.setValueAtTime(0.0001, now)
      gain.gain.exponentialRampToValueAtTime(0.38, now + 0.12)
      gain.gain.setValueAtTime(0.38, now + Math.max(0.15, duration - 0.55))
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration)
      source.connect(filter).connect(gain).connect(output)
      source.onended = () => {
        try { source.disconnect() } catch { /* harmless */ }
        try { filter.disconnect() } catch { /* harmless */ }
        try { gain.disconnect() } catch { /* harmless */ }
      }
      source.start(now, slice.offset, duration)
    })
    .catch(() => {
      // Silence is preferable to falling back to a synthetic animal call.
    })
}

function playAbductedOwlCall(soundOn: boolean) {
  if (!soundOn) return
  const ac = getPitchAudio()
  if (!ac) return

  const now = ac.currentTime
  const duration = 1.15
  const output = getPitchAudioTransientOutput(ac)
  const filter = ac.createBiquadFilter()
  const gain = ac.createGain()
  filter.type = 'lowpass'
  filter.frequency.setValueAtTime(620, now)
  filter.frequency.exponentialRampToValueAtTime(430, now + duration)
  filter.Q.value = 0.5
  gain.gain.setValueAtTime(0.0001, now)
  gain.gain.exponentialRampToValueAtTime(0.010, now + 0.08)
  gain.gain.exponentialRampToValueAtTime(0.0045, now + 0.42)
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration)
  gain.connect(filter).connect(output)

  const voice = ac.createOscillator()
  voice.type = 'sine'
  voice.frequency.setValueAtTime(154, now)
  voice.frequency.exponentialRampToValueAtTime(186, now + 0.44)
  voice.frequency.exponentialRampToValueAtTime(228, now + duration)
  voice.connect(gain)

  const body = ac.createOscillator()
  const bodyGain = ac.createGain()
  body.type = 'triangle'
  body.frequency.setValueAtTime(77, now)
  body.frequency.exponentialRampToValueAtTime(112, now + duration)
  bodyGain.gain.value = 0.12
  body.connect(bodyGain).connect(gain)

  voice.start(now)
  body.start(now)
  voice.stop(now + duration)
  body.stop(now + duration)
}

export function RareSkyEventLayer({ event, soundOn = false, onComplete }: LayerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const eventRef = useRef(event)
  const soundRef = useRef(soundOn)
  const completeRef = useRef(onComplete)

  useEffect(() => { eventRef.current = event }, [event])
  useEffect(() => { soundRef.current = soundOn }, [soundOn])
  useEffect(() => { completeRef.current = onComplete }, [onComplete])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let width = window.innerWidth
    let height = window.innerHeight
    let dpr = Math.min(window.devicePixelRatio || 1, 1.35)
    let raf = 0
    let currentId = -1
    let currentKind: RareEventKind | null = null
    let startedAt = 0
    let completed = false
    let lastRenderedAt = 0
    let boomTimer: number | null = null
    let owlTimer: number | null = null
    let ufoHootTimer: number | null = null
    let auroraField: AuroraFieldRuntime | null = null

    const resize = () => {
      width = window.innerWidth
      height = window.innerHeight
      dpr = Math.min(window.devicePixelRatio || 1, 1.35)
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      auroraField = createAuroraField(width, height)
    }

    const durationFor = (kind: RareEventKind | null) => {
      if (kind === 'aurora') return 94_000
      if (kind === 'great-meteor') return 15_500
      if (kind === 'distant-storm') return 72_000
      if (kind === 'impossible-star') return 32_000
      if (kind === 'owl') return 9_600
      if (kind === 'owl-ufo') return 15_600
      return 0
    }

    const draw = (time: number) => {
      const requested = eventRef.current
      if (!requested || requested.kind === 'ground-fog') {
        currentId = -1
        currentKind = null
        completed = false
        if (boomTimer !== null) {
          window.clearTimeout(boomTimer)
          boomTimer = null
        }
        if (owlTimer !== null) {
          window.clearTimeout(owlTimer)
          owlTimer = null
        }
        if (ufoHootTimer !== null) {
          window.clearTimeout(ufoHootTimer)
          ufoHootTimer = null
        }
        ctx.clearRect(0, 0, width, height)
        raf = requestAnimationFrame(draw)
        return
      }

      if (requested.id !== currentId || requested.kind !== currentKind) {
        if (boomTimer !== null) window.clearTimeout(boomTimer)
        if (owlTimer !== null) window.clearTimeout(owlTimer)
        if (ufoHootTimer !== null) window.clearTimeout(ufoHootTimer)
        currentId = requested.id
        currentKind = requested.kind
        startedAt = time
        completed = false
        lastRenderedAt = 0
        if (requested.kind === 'aurora' && auroraField) auroraField.lastUpdate = -Infinity
        if (requested.kind === 'great-meteor') {
          boomTimer = window.setTimeout(() => {
            playMeteorBoom(soundRef.current)
            boomTimer = null
          }, 12_300)
        }
        if (requested.kind === 'owl' || requested.kind === 'owl-ufo') {
          if (soundRef.current) {
            const owlAudio = getPitchAudio()
            if (owlAudio) void loadPitchAudioAsset(owlAudio, 'owl-field.mp3').catch(() => undefined)
          }
          owlTimer = window.setTimeout(() => {
            playOwlCall(soundRef.current, requested.id)
            owlTimer = null
          }, 5_350)
        }
        if (requested.kind === 'owl-ufo') {
          ufoHootTimer = window.setTimeout(() => {
            playAbductedOwlCall(soundRef.current)
            ufoHootTimer = null
          }, 12_050)
        }
      }

      const elapsed = time - startedAt
      const minFrameMs = currentKind === 'great-meteor' ? 0 : 30
      if (minFrameMs > 0 && time - lastRenderedAt < minFrameMs) {
        raf = requestAnimationFrame(draw)
        return
      }
      lastRenderedAt = time
      ctx.clearRect(0, 0, width, height)

      if (currentKind === 'aurora') {
        if (!auroraField) auroraField = createAuroraField(width, height)
        drawAurora(ctx, auroraField, width, height, elapsed)
      }
      if (currentKind === 'great-meteor') drawGreatMeteor(ctx, width, height, elapsed)
      if (currentKind === 'distant-storm') drawDistantStorm(ctx, width, height, elapsed, currentId)
      if (currentKind === 'impossible-star') drawImpossibleStar(ctx, width, height, elapsed)
      if (currentKind === 'owl') drawOwl(ctx, width, height, elapsed, currentId)
      if (currentKind === 'owl-ufo') drawOwlUfo(ctx, width, height, elapsed, currentId)

      const duration = durationFor(currentKind)
      if (!completed && duration > 0 && elapsed >= duration) {
        completed = true
        completeRef.current?.(currentKind, currentId)
      }

      raf = requestAnimationFrame(draw)
    }

    resize()
    window.addEventListener('resize', resize)
    raf = requestAnimationFrame(draw)

    return () => {
      cancelAnimationFrame(raf)
      if (boomTimer !== null) window.clearTimeout(boomTimer)
      if (owlTimer !== null) window.clearTimeout(owlTimer)
      if (ufoHootTimer !== null) window.clearTimeout(ufoHootTimer)
      window.removeEventListener('resize', resize)
    }
  }, [])

  return <canvas ref={canvasRef} className="scene-canvas rare-sky-event-canvas" aria-hidden="true" />
}

export function RareGroundEventLayer({ event, onComplete }: LayerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const eventRef = useRef(event)
  const completeRef = useRef(onComplete)

  useEffect(() => { eventRef.current = event }, [event])
  useEffect(() => { completeRef.current = onComplete }, [onComplete])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let width = window.innerWidth
    let height = window.innerHeight
    let dpr = Math.min(window.devicePixelRatio || 1, 1.25)
    let raf = 0
    let currentId = -1
    let startedAt = 0
    let completed = false
    let lastRenderedAt = 0
    let fogField: {
      canvas: HTMLCanvasElement
      ctx: CanvasRenderingContext2D
      image: ImageData
      width: number
      height: number
      lastUpdate: number
    } | null = null

    const createFogField = () => {
      const fieldWidth = Math.max(180, Math.min(340, Math.round(width / 5)))
      const fieldHeight = Math.max(48, Math.min(88, Math.round(fieldWidth * 0.24)))
      const fieldCanvas = document.createElement('canvas')
      fieldCanvas.width = fieldWidth
      fieldCanvas.height = fieldHeight
      const fieldCtx = fieldCanvas.getContext('2d', { alpha: true })
      if (!fieldCtx) return null
      return {
        canvas: fieldCanvas,
        ctx: fieldCtx,
        image: fieldCtx.createImageData(fieldWidth, fieldHeight),
        width: fieldWidth,
        height: fieldHeight,
        lastUpdate: Number.NEGATIVE_INFINITY,
      }
    }

    const renderFogField = (elapsed: number, id: number) => {
      if (!fogField) fogField = createFogField()
      if (!fogField || elapsed - fogField.lastUpdate < 86) return
      fogField.lastUpdate = elapsed

      const t = elapsed * 0.0000105
      const seed = 611.7 + id * 17.9
      const data = fogField.image.data
      const fw = fogField.width
      const fh = fogField.height

      for (let y = 0; y < fh; y++) {
        const ny = y / Math.max(1, fh - 1)
        const lowerEnvelope = 1 - smoothStep((ny - 0.92) / 0.10)

        for (let x = 0; x < fw; x++) {
          const nx = x / Math.max(1, fw - 1)
          const shear = (ny - 0.52) * 0.22
          const broadWarp = fbm2D(nx * 1.25 + t * 0.10, ny * 0.86 - t * 0.025, seed + 21.4) * 0.18
          const fineWarp = fbm2D(nx * 3.4 - t * 0.035, ny * 1.7 + 2.2, seed + 43.8) * 0.055
          const driftX = nx * 2.15 + t * (0.19 + ny * 0.07) + shear + broadWarp + fineWarp

          const broad = fbm2D(driftX, ny * 0.92 + 3.8, seed + 71.1)
          const medium = fbm2D(driftX * 2.35 + 5.2, ny * 1.85 - t * 0.045, seed + 104.6)
          const detail = fbm2D(driftX * 4.6 + 1.4, ny * 3.2 + t * 0.055, seed + 151.9)

          const ceiling = 0.17
            + fbm1D(nx * 1.48 + t * 0.07 + id * 0.13, seed + 203.7) * 0.075
            + fbm1D(nx * 3.3 - t * 0.035, seed + 251.2) * 0.028
          const verticalPresence = smoothStep((ny - ceiling) / 0.24) * lowerEnvelope
          const body = broad * 0.58 + medium * 0.30 + detail * 0.12
          const density = clamp01((body + 0.24) * 1.55) * verticalPresence

          const openPockets = smoothStep((fbm2D(nx * 1.12 - t * 0.055, ny * 0.72 + 6.4, seed + 319.5) + 0.20) / 0.72)
          const wisp = clamp01((medium + 0.25) * 1.45) * smoothStep((ny - 0.32) / 0.24)
          const alpha = Math.pow(density, 1.28) * (0.48 + openPockets * 0.52) + wisp * 0.08

          const i = (y * fw + x) * 4
          data[i] = 143
          data[i + 1] = 155
          data[i + 2] = 162
          data[i + 3] = Math.round(clamp01(alpha) * 24)
        }
      }

      fogField.ctx.putImageData(fogField.image, 0, 0)
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
      fogField = createFogField()
    }

    const drawFog = (elapsed: number, id: number) => {
      const duration = 86_000
      const fade = smoothStep(Math.min(elapsed / 12_000, (duration - elapsed) / 14_000))
      if (fade <= 0) return
      const floor = worldBaseY(height)
      const waterY = standingWaterSurfaceY(height)
      const fogTop = Math.min(floor - 7, Number.isFinite(waterY) ? waterY - 3 : floor - 7)
      const depth = Math.min(86, Math.max(34, height * 0.09))

      renderFogField(elapsed, id)
      if (!fogField) return

      ctx.save()
      ctx.beginPath()
      ctx.moveTo(0, fogTop - depth * 0.78)
      const terrainStep = Math.max(8, width / 160)
      for (let x = 0; x <= width + terrainStep; x += terrainStep) {
        const px = Math.min(width, x)
        ctx.lineTo(px, surfaceYAt(px, width, height) + 2)
      }
      ctx.lineTo(width, fogTop - depth * 0.78)
      ctx.closePath()
      ctx.clip()

      ctx.globalAlpha = fade
      ctx.imageSmoothingEnabled = true
      ctx.drawImage(
        fogField.canvas,
        -width * 0.035,
        fogTop - depth * 0.72,
        width * 1.07,
        depth * 1.42,
      )

      // A near-ground moisture shelf makes the field settle into the landscape
      // without revealing a flat geometric band.
      const shelf = ctx.createLinearGradient(0, fogTop - depth * 0.18, 0, fogTop + depth * 0.50)
      shelf.addColorStop(0, 'rgba(145,158,165,0)')
      shelf.addColorStop(0.56, `rgba(145,158,165,${0.010 * fade})`)
      shelf.addColorStop(1, 'rgba(145,158,165,0)')
      ctx.fillStyle = shelf
      ctx.fillRect(0, fogTop - depth * 0.20, width, depth * 0.72)
      ctx.restore()
    }

    const draw = (time: number) => {
      const requested = eventRef.current
      if (!requested || requested.kind !== 'ground-fog') {
        currentId = -1
        completed = false
        ctx.clearRect(0, 0, width, height)
        raf = requestAnimationFrame(draw)
        return
      }

      if (requested.id !== currentId) {
        currentId = requested.id
        startedAt = time
        completed = false
        lastRenderedAt = 0
        if (fogField) fogField.lastUpdate = Number.NEGATIVE_INFINITY
      }

      const elapsed = time - startedAt
      if (time - lastRenderedAt < 30) {
        raf = requestAnimationFrame(draw)
        return
      }
      lastRenderedAt = time
      ctx.clearRect(0, 0, width, height)
      drawFog(elapsed, currentId)

      if (!completed && elapsed >= 86_000) {
        completed = true
        completeRef.current?.('ground-fog', currentId)
      }

      raf = requestAnimationFrame(draw)
    }

    resize()
    window.addEventListener('resize', resize)
    raf = requestAnimationFrame(draw)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
    }
  }, [])

  return <canvas ref={canvasRef} className="scene-canvas rare-ground-event-canvas" aria-hidden="true" />
}
