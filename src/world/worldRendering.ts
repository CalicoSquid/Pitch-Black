import {
  groundSurfaceYAtIndex,
  snowSurfaceYAtIndex,
  pitchWorld,
  terrainClearanceLiftAtIndex,
  worldBaseY,
  worldIndexAt,
} from './worldState'

export type TerrainRenderCache = {
  snowDepth: Float64Array
  groundY: Float64Array
  snowY: Float64Array
  gradient: CanvasGradient | null
  gradientHeight: number
}

export function createTerrainRenderCache(): TerrainRenderCache {
  return {
    snowDepth: new Float64Array(0),
    groundY: new Float64Array(0),
    snowY: new Float64Array(0),
    gradient: null,
    gradientHeight: -1,
  }
}

export function invalidateTerrainRenderCache(cache: TerrainRenderCache) {
  cache.gradient = null
  cache.gradientHeight = -1
}

export function drawFrozenSkin(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  light = 1,
) {
  const ice = pitchWorld.ice
  if (ice.length < 3) return

  const brightness = Math.max(0.18, light)

  // Ice in this world is intentionally not a new coloured material. It is a
  // hair-thin glassy skin riding the existing terrain/snow contour. Short,
  // deterministic breaks keep it from reading as a UI line on flat ground.
  for (let i = 1; i < ice.length; i++) {
    const localSnow = (pitchWorld.drifts[i - 1] + pitchWorld.drifts[i]) * 0.5
    const burial = Math.max(0, Math.min(1, 1 - Math.max(0, localSnow - 1.1) / 6.2))
    const frozen = Math.min(1, (ice[i - 1] + ice[i]) * 0.5) * burial
    if (frozen < 0.035) continue

    const seed = Math.sin(i * 19.173 + 1.87) * 43758.5453
    const frac = seed - Math.floor(seed)
    if (frozen < 0.28 && frac < 0.30) continue

    const x1 = Math.min(width, (i - 1) * 6)
    const x2 = Math.min(width, i * 6)
    const y1 = snowSurfaceYAtIndex(i - 1, height) - 0.22
    const y2 = snowSurfaceYAtIndex(i, height) - 0.22
    const alpha = Math.min(0.15, (0.020 + frozen * 0.105) * brightness * (0.78 + frac * 0.32))

    ctx.beginPath()
    ctx.moveTo(x1, y1)
    ctx.lineTo(x2, y2)
    ctx.strokeStyle = `rgba(184, 211, 226, ${alpha})`
    ctx.lineWidth = 0.72
    ctx.lineCap = 'round'
    ctx.stroke()

    // Fully caught ice occasionally flashes a second pin-thin facet. This is
    // static geometry, not sparkle animation: the surface should feel frozen,
    // not glittery.
    if (frozen > 0.68 && frac > 0.68) {
      const midX = (x1 + x2) * 0.5
      const midY = (y1 + y2) * 0.5
      ctx.beginPath()
      ctx.moveTo(x1 + (midX - x1) * 0.18, y1 + (midY - y1) * 0.18 - 0.22)
      ctx.lineTo(midX + (x2 - midX) * 0.38, midY + (y2 - midY) * 0.38 - 0.22)
      ctx.strokeStyle = `rgba(224, 237, 244, ${Math.min(0.095, frozen * 0.085 * brightness)})`
      ctx.lineWidth = 0.38
      ctx.stroke()
    }
  }
}

export function drawStandingWater(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  light = 1,
) {
  const water = pitchWorld.water
  if (water.length < 3) return

  const brightness = Math.max(0.18, light)

  for (let i = 1; i < water.length - 1; i += 2) {
    const amount = water[i]
    if (amount < 0.16 || pitchWorld.drifts[i] > 6) continue

    const frozen = Math.max(0, Math.min(1, pitchWorld.ice[i] || 0))
    const liquid = 1 - frozen
    const x = Math.min(width, i * 6)
    const groundY = groundSurfaceYAtIndex(i, height)
    const seed = Math.sin(i * 17.31) * 43758.5453
    const jitter = (seed - Math.floor(seed) - 0.5) * 2.4
    const radiusX = Math.min(11, 4.4 + amount * 0.72)
    const radiusY = Math.min(2.3, 0.55 + amount * 0.13)
    const centerY = groundY - 0.35 - radiusY * 0.32

    // The pool stays physically present while freezing; only its optical
    // character changes from soft dark water to a flatter glassy surface.
    ctx.beginPath()
    ctx.ellipse(x + jitter, centerY, radiusX, radiusY, jitter * 0.018, 0, Math.PI * 2)
    const poolAlpha = Math.min(0.15, (0.038 + amount * 0.009) * brightness * (0.92 + frozen * 0.18))
    ctx.fillStyle = frozen > 0.08
      ? `rgba(58, 77, 89, ${poolAlpha})`
      : `rgba(42, 60, 73, ${poolAlpha})`
    ctx.fill()

    ctx.beginPath()
    ctx.ellipse(x + jitter - radiusX * 0.08, centerY - radiusY * 0.28, radiusX * (0.62 + frozen * 0.12), Math.max(0.14, radiusY * (0.18 - frozen * 0.045)), jitter * 0.018, Math.PI * 1.08, Math.PI * 1.88)
    ctx.strokeStyle = `rgba(176, 207, 224, ${Math.min(0.11, (0.018 + amount * 0.005 + frozen * 0.038) * brightness * (0.58 + liquid * 0.42))})`
    ctx.lineWidth = 0.42 + frozen * 0.08
    ctx.stroke()

    if (frozen > 0.80 && amount > 1.15) {
      const crackSeed = Math.sin(i * 7.91 + 0.73) * 951.1357
      const crackFrac = crackSeed - Math.floor(crackSeed)
      if (crackFrac > 0.63) {
        ctx.beginPath()
        ctx.moveTo(x + jitter - radiusX * 0.32, centerY - 0.04)
        ctx.lineTo(x + jitter - radiusX * 0.08, centerY + radiusY * 0.10)
        ctx.lineTo(x + jitter + radiusX * 0.18, centerY - radiusY * 0.12)
        ctx.strokeStyle = `rgba(205, 223, 233, ${0.032 * brightness * frozen})`
        ctx.lineWidth = 0.34
        ctx.stroke()
      }
    }
  }
}

export function drawTerrain(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  light = 1,
  time = 0,
  wet = 0,
  cache: TerrainRenderCache,
) {
  const snow = pitchWorld.drifts
  const ground = pitchWorld.ground
  if (snow.length < 2 || ground.length !== snow.length) return

  if (cache.snowDepth.length !== snow.length) {
    cache.snowDepth = new Float64Array(snow.length)
    cache.groundY = new Float64Array(snow.length)
    cache.snowY = new Float64Array(snow.length)
  }

  const baseY = worldBaseY(height)
  for (let i = 0; i < snow.length; i++) {
    const a = snow[Math.max(0, i - 2)]
    const b = snow[Math.max(0, i - 1)]
    const c = snow[i]
    const d = snow[Math.min(snow.length - 1, i + 1)]
    const e = snow[Math.min(snow.length - 1, i + 2)]
    const base = (a + b * 2 + c * 3 + d * 2 + e) / 9
    const shimmer = Math.sin(time * 0.00022 + i * 0.31) * Math.min(0.32, base * 0.008)
    const depth = Math.max(0, base + shimmer)
    const groundY = baseY - ground[i] - terrainClearanceLiftAtIndex(i)

    cache.snowDepth[i] = depth
    cache.groundY[i] = groundY
    cache.snowY[i] = groundY - depth
  }

  const groundY = cache.groundY
  const snowY = cache.snowY

  // Permanent earth mass. Nearly black by design; it primarily establishes space.
  ctx.beginPath()
  ctx.moveTo(0, groundY[0])
  for (let i = 1; i < ground.length; i++) {
    const x = Math.min(width, i * 6)
    ctx.lineTo(x, groundY[i])
  }
  ctx.lineTo(width, height)
  ctx.lineTo(0, height)
  ctx.closePath()
  ctx.fillStyle = 'rgba(2, 3, 3, 0.22)'
  ctx.fill()

  // Snow is now a distinct layer sitting on the permanent terrain.
  ctx.beginPath()
  ctx.moveTo(0, snowY[0])
  for (let i = 1; i < snow.length; i++) {
    const x = Math.min(width, i * 6)
    const prevX = Math.min(width, (i - 1) * 6)
    const prevY = snowY[i - 1]
    const y = snowY[i]
    ctx.quadraticCurveTo(prevX, prevY, (prevX + x) / 2, (prevY + y) / 2)
  }

  for (let i = snow.length - 1; i >= 0; i--) {
    const x = Math.min(width, i * 6)
    ctx.lineTo(x, groundY[i])
  }
  ctx.closePath()

  const brightness = Math.max(0.08, light)
  if (!cache.gradient || cache.gradientHeight !== height) {
    const gradient = ctx.createLinearGradient(0, baseY - 90, 0, baseY + 12)
    gradient.addColorStop(0, 'rgba(231, 237, 242, 0.175)')
    gradient.addColorStop(0.45, 'rgba(214, 223, 231, 0.128)')
    gradient.addColorStop(1, 'rgba(169, 184, 196, 0.048)')
    cache.gradient = gradient
    cache.gradientHeight = height
  }
  const previousAlpha = ctx.globalAlpha
  ctx.globalAlpha = previousAlpha * brightness
  ctx.fillStyle = cache.gradient
  ctx.fill()
  ctx.globalAlpha = previousAlpha

  // Fine snow texture follows the raised snow surface.
  const step = Math.max(10, Math.floor(width / 110))
  for (let x = 4; x < width; x += step) {
    const idx = worldIndexAt(x, width)
    const depth = cache.snowDepth[idx]
    if (depth < 1.2) continue
    const n = Math.sin(x * 12.9898 + 78.233) * 43758.5453
    const frac = n - Math.floor(n)
    const y = snowY[idx] + 1.5 + frac * Math.min(7, depth * 0.22)

    ctx.beginPath()
    ctx.arc(x + (frac - 0.5) * 5, y, 0.35 + frac * 0.35, 0, Math.PI * 2)
    ctx.fillStyle = `rgba(239, 243, 246, ${(0.026 + frac * 0.026) * brightness})`
    ctx.fill()
  }

  ctx.beginPath()
  ctx.moveTo(0, snowY[0])
  for (let i = 1; i < snow.length; i++) {
    const x = Math.min(width, i * 6)
    const prevX = Math.min(width, (i - 1) * 6)
    const prevY = snowY[i - 1]
    const y = snowY[i]
    ctx.quadraticCurveTo(prevX, prevY, (prevX + x) / 2, (prevY + y) / 2)
  }
  ctx.strokeStyle = `rgba(238, 243, 247, ${0.118 * brightness})`
  ctx.lineWidth = 0.55
  ctx.stroke()

  if (wet > 0.01) {
    ctx.beginPath()
    ctx.moveTo(0, snowY[0] + 1)
    for (let i = 1; i < snow.length; i++) {
      const x = Math.min(width, i * 6)
      ctx.lineTo(x, snowY[i] + 1)
    }
    ctx.strokeStyle = `rgba(177, 198, 211, ${Math.min(0.055, wet * 0.055)})`
    ctx.lineWidth = 0.7
    ctx.stroke()
  }
}


