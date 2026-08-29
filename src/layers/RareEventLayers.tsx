import { useEffect, useRef } from 'react'
import { getPitchAudio, getPitchAudioOutput } from '../audio/pitchAudio'
import { standingWaterSurfaceY, surfaceYAt, worldBaseY } from '../world/worldState'

export type RareEventKind = 'aurora' | 'great-meteor' | 'distant-storm' | 'ground-fog' | 'impossible-star'

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
  source.connect(filter).connect(gain).connect(getPitchAudioOutput(ac))
  source.start()
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
    let boomTimer: number | null = null
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
        ctx.clearRect(0, 0, width, height)
        raf = requestAnimationFrame(draw)
        return
      }

      if (requested.id !== currentId || requested.kind !== currentKind) {
        if (boomTimer !== null) window.clearTimeout(boomTimer)
        currentId = requested.id
        currentKind = requested.kind
        startedAt = time
        completed = false
        if (requested.kind === 'aurora' && auroraField) auroraField.lastUpdate = -Infinity
        if (requested.kind === 'great-meteor') {
          boomTimer = window.setTimeout(() => {
            playMeteorBoom(soundRef.current)
            boomTimer = null
          }, 12_300)
        }
      }

      const elapsed = time - startedAt
      ctx.clearRect(0, 0, width, height)

      if (currentKind === 'aurora') {
        if (!auroraField) auroraField = createAuroraField(width, height)
        drawAurora(ctx, auroraField, width, height, elapsed)
      }
      if (currentKind === 'great-meteor') drawGreatMeteor(ctx, width, height, elapsed)
      if (currentKind === 'distant-storm') drawDistantStorm(ctx, width, height, elapsed, currentId)
      if (currentKind === 'impossible-star') drawImpossibleStar(ctx, width, height, elapsed)

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

    const resize = () => {
      width = window.innerWidth
      height = window.innerHeight
      dpr = Math.min(window.devicePixelRatio || 1, 1.25)
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }

    const drawFog = (elapsed: number, id: number) => {
      const duration = 86_000
      const fade = smoothStep(Math.min(elapsed / 12_000, (duration - elapsed) / 14_000))
      if (fade <= 0) return
      const floor = worldBaseY(height)
      const waterY = standingWaterSurfaceY(height)
      const fogTop = Math.min(floor - 7, Number.isFinite(waterY) ? waterY - 3 : floor - 7)
      const depth = Math.min(86, Math.max(34, height * 0.09))

      // Broad, low rolling banks. A handful of ellipses is enough at this scale;
      // all motion is slow and lateral so it reads as ground-hugging mist.
      const banks = 11
      for (let i = 0; i < banks; i++) {
        const speed = 0.0028 + seededFrac(id * 7.1 + i * 13.3) * 0.0022
        const direction = seededFrac(id * 4.2 + i * 17.1) < 0.5 ? -1 : 1
        const phase = seededFrac(id * 19.7 + i * 5.8)
        const travel = ((phase + elapsed * speed * 0.001 * direction) % 1 + 1) % 1
        const x = (travel * 1.35 - 0.17) * width
        const y = fogTop + (seededFrac(id * 11.2 + i * 9.1) - 0.28) * depth * 0.48
        const rx = width * (0.10 + seededFrac(id * 3.8 + i * 8.6) * 0.13)
        const ry = depth * (0.24 + seededFrac(id * 6.3 + i * 14.8) * 0.30)
        const alpha = fade * (0.018 + seededFrac(id * 23.7 + i * 11.4) * 0.022)
        const g = ctx.createRadialGradient(x, y, 0, x, y, rx)
        g.addColorStop(0, `rgba(157,169,176,${alpha})`)
        g.addColorStop(0.62, `rgba(137,150,158,${alpha * 0.58})`)
        g.addColorStop(1, 'rgba(120,133,141,0)')
        ctx.fillStyle = g
        ctx.beginPath()
        ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2)
        ctx.fill()
      }

      // Thin level veil right along the ground/water gives the banks continuity.
      const shelf = ctx.createLinearGradient(0, fogTop - depth * 0.30, 0, fogTop + depth * 0.42)
      shelf.addColorStop(0, 'rgba(145,158,165,0)')
      shelf.addColorStop(0.52, `rgba(145,158,165,${0.020 * fade})`)
      shelf.addColorStop(1, 'rgba(145,158,165,0)')
      ctx.fillStyle = shelf
      ctx.fillRect(0, fogTop - depth * 0.32, width, depth * 0.84)
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
      }

      const elapsed = time - startedAt
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
