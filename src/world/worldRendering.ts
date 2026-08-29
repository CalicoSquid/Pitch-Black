import {
  groundSurfaceYAtIndex,
  standingWaterSurfaceY,
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
  groundYCache?: Float64Array,
) {
  const ice = pitchWorld.ice
  if (ice.length < 3) return

  let hasVisibleIce = false
  for (let i = 1; i < ice.length - 1; i++) {
    if (ice[i] > 0.025) {
      hasVisibleIce = true
      break
    }
  }
  if (!hasVisibleIce) return

  const waterY = standingWaterSurfaceY(height)
  if (!Number.isFinite(waterY)) return

  const brightness = Math.max(0.18, light)
  const stepX = 6

  // Ice remains one perfectly level plane. Heat thaws the material over time;
  // it never punches a local geometric hole through the surface.
  for (let i = 1; i < ice.length; i++) {
    const x1 = Math.min(width, (i - 1) * stepX)
    const x2 = Math.min(width, i * stepX)
    if (x2 <= x1) continue

    const localSnow = (pitchWorld.drifts[i - 1] + pitchWorld.drifts[i]) * 0.5
    const burial = Math.max(0, Math.min(1, 1 - Math.max(0, localSnow - 0.9) / 7.5))
    const frozen = Math.min(1, (ice[i - 1] + ice[i]) * 0.5) * burial
    if (frozen < 0.025) continue

    const g1 = groundYCache?.[i - 1] ?? groundSurfaceYAtIndex(i - 1, height)
    const g2 = groundYCache?.[i] ?? groundSurfaceYAtIndex(i, height)
    if (g1 <= waterY && g2 <= waterY) continue

    const fillAlpha = Math.min(0.13, (0.024 + frozen * 0.095) * brightness)
    ctx.beginPath()
    ctx.moveTo(x1, waterY)
    ctx.lineTo(x2, waterY)
    ctx.lineTo(x2, Math.max(g2, waterY))
    ctx.lineTo(x1, Math.max(g1, waterY))
    ctx.closePath()
    ctx.fillStyle = `rgba(58, 76, 88, ${fillAlpha})`
    ctx.fill()

    ctx.beginPath()
    ctx.moveTo(x1, waterY)
    ctx.lineTo(x2, waterY)
    ctx.strokeStyle = `rgba(192, 216, 228, ${Math.min(0.16, (0.030 + frozen * 0.11) * brightness)})`
    ctx.lineWidth = 0.9
    ctx.stroke()

    if (frozen > 0.44) {
      ctx.beginPath()
      ctx.moveTo(x1, waterY - 0.32)
      ctx.lineTo(x2, waterY - 0.32)
      ctx.strokeStyle = `rgba(228, 238, 244, ${Math.min(0.085, frozen * 0.065 * brightness)})`
      ctx.lineWidth = 0.36
      ctx.stroke()
    }
  }
}

export function drawStandingWater(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  light = 1,
  groundYCache?: Float64Array,
) {
  if (pitchWorld.water.length < 3) return

  const waterY = standingWaterSurfaceY(height)
  if (!Number.isFinite(waterY)) return

  const fillPresence = Math.min(1, pitchWorld.waterLevel * 1.12)
  if (fillPresence < 0.02) return

  const brightness = Math.max(0.18, light)
  const stepX = 6

  // A single shared level remains the visual rule. Local heat is expressed as
  // steam/recession, never as a cutout or crater in the water plane.
  for (let i = 1; i < pitchWorld.water.length; i++) {
    const x1 = Math.min(width, (i - 1) * stepX)
    const x2 = Math.min(width, i * stepX)
    if (x2 <= x1) continue

    const frozen = Math.max(0, Math.min(1, (pitchWorld.ice[i - 1] + pitchWorld.ice[i]) * 0.5))
    const localSnow = (pitchWorld.drifts[i - 1] + pitchWorld.drifts[i]) * 0.5
    const burial = Math.max(0, Math.min(1, 1 - Math.max(0, localSnow - 0.8) / 6.8))
    const liquid = fillPresence * burial * (1 - frozen * 0.88)
    if (liquid < 0.018) continue

    const g1 = groundYCache?.[i - 1] ?? groundSurfaceYAtIndex(i - 1, height)
    const g2 = groundYCache?.[i] ?? groundSurfaceYAtIndex(i, height)
    if (g1 <= waterY && g2 <= waterY) continue

    const fillAlpha = Math.min(0.14, (0.042 + liquid * 0.078) * brightness)
    ctx.beginPath()
    ctx.moveTo(x1, waterY)
    ctx.lineTo(x2, waterY)
    ctx.lineTo(x2, Math.max(g2, waterY))
    ctx.lineTo(x1, Math.max(g1, waterY))
    ctx.closePath()
    ctx.fillStyle = `rgba(38, 56, 69, ${fillAlpha})`
    ctx.fill()

    ctx.beginPath()
    ctx.moveTo(x1, waterY)
    ctx.lineTo(x2, waterY)
    ctx.strokeStyle = `rgba(176, 205, 221, ${Math.min(0.14, (0.028 + liquid * 0.058) * brightness)})`
    ctx.lineWidth = 0.72
    ctx.stroke()

    if (liquid > 0.34) {
      ctx.beginPath()
      ctx.moveTo(x1, waterY - 0.22)
      ctx.lineTo(x2, waterY - 0.22)
      ctx.strokeStyle = `rgba(212, 227, 235, ${Math.min(0.065, liquid * 0.048 * brightness)})`
      ctx.lineWidth = 0.34
      ctx.stroke()
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


