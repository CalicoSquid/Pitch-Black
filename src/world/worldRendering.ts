import {
  groundSurfaceYAtIndex,
  pitchWorld,
  worldBaseY,
  worldIndexAt,
} from './worldState'

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
    if (amount < 0.12 || pitchWorld.drifts[i] > 6) continue

    const x = Math.min(width, i * 6)
    const groundY = groundSurfaceYAtIndex(i, height)
    const visibleDepth = Math.min(12, 2.2 + amount * 0.9)
    const poolWidth = 14

    ctx.fillStyle = `rgba(42, 60, 73, ${Math.min(0.16, (0.05 + amount * 0.011) * brightness)})`
    ctx.fillRect(x - 4, groundY - visibleDepth, poolWidth, visibleDepth)

    ctx.fillStyle = `rgba(166, 194, 211, ${Math.min(0.10, (0.025 + amount * 0.007) * brightness)})`
    ctx.fillRect(x - 3, groundY - visibleDepth, poolWidth - 2, 0.7)
  }
}

export function drawTerrain(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  light = 1,
  time = 0,
  wet = 0,
) {
  const snow = pitchWorld.drifts
  const ground = pitchWorld.ground
  if (snow.length < 2 || ground.length !== snow.length) return

  const smoothSnow = (i: number) => {
    const a = snow[Math.max(0, i - 2)]
    const b = snow[Math.max(0, i - 1)]
    const c = snow[i]
    const d = snow[Math.min(snow.length - 1, i + 1)]
    const e = snow[Math.min(snow.length - 1, i + 2)]
    const base = (a + b * 2 + c * 3 + d * 2 + e) / 9
    const shimmer = Math.sin(time * 0.00022 + i * 0.31) * Math.min(0.32, base * 0.008)
    return Math.max(0, base + shimmer)
  }

  const groundY = (i: number) => groundSurfaceYAtIndex(i, height)
  const snowY = (i: number) => groundY(i) - smoothSnow(i)

  // Permanent earth mass. Nearly black by design; it primarily establishes space.
  ctx.beginPath()
  ctx.moveTo(0, groundY(0))
  for (let i = 1; i < ground.length; i++) {
    const x = Math.min(width, i * 6)
    ctx.lineTo(x, groundY(i))
  }
  ctx.lineTo(width, height)
  ctx.lineTo(0, height)
  ctx.closePath()
  ctx.fillStyle = 'rgba(2, 3, 3, 0.22)'
  ctx.fill()

  // Snow is now a distinct layer sitting on the permanent terrain.
  ctx.beginPath()
  ctx.moveTo(0, snowY(0))
  for (let i = 1; i < snow.length; i++) {
    const x = Math.min(width, i * 6)
    const prevX = Math.min(width, (i - 1) * 6)
    const prevY = snowY(i - 1)
    const y = snowY(i)
    ctx.quadraticCurveTo(prevX, prevY, (prevX + x) / 2, (prevY + y) / 2)
  }

  for (let i = snow.length - 1; i >= 0; i--) {
    const x = Math.min(width, i * 6)
    ctx.lineTo(x, groundY(i))
  }
  ctx.closePath()

  const brightness = Math.max(0.08, light)
  const g = ctx.createLinearGradient(0, worldBaseY(height) - 90, 0, worldBaseY(height) + 12)
  g.addColorStop(0, `rgba(231, 237, 242, ${0.175 * brightness})`)
  g.addColorStop(0.45, `rgba(214, 223, 231, ${0.128 * brightness})`)
  g.addColorStop(1, `rgba(169, 184, 196, ${0.048 * brightness})`)
  ctx.fillStyle = g
  ctx.fill()

  // Fine snow texture follows the raised snow surface.
  const step = Math.max(10, Math.floor(width / 110))
  for (let x = 4; x < width; x += step) {
    const idx = worldIndexAt(x, width)
    const depth = smoothSnow(idx)
    if (depth < 1.2) continue
    const n = Math.sin(x * 12.9898 + 78.233) * 43758.5453
    const frac = n - Math.floor(n)
    const y = snowY(idx) + 1.5 + frac * Math.min(7, depth * 0.22)

    ctx.beginPath()
    ctx.arc(x + (frac - 0.5) * 5, y, 0.35 + frac * 0.35, 0, Math.PI * 2)
    ctx.fillStyle = `rgba(239, 243, 246, ${(0.026 + frac * 0.026) * brightness})`
    ctx.fill()
  }

  ctx.beginPath()
  ctx.moveTo(0, snowY(0))
  for (let i = 1; i < snow.length; i++) {
    const x = Math.min(width, i * 6)
    const prevX = Math.min(width, (i - 1) * 6)
    const prevY = snowY(i - 1)
    const y = snowY(i)
    ctx.quadraticCurveTo(prevX, prevY, (prevX + x) / 2, (prevY + y) / 2)
  }
  ctx.strokeStyle = `rgba(238, 243, 247, ${0.118 * brightness})`
  ctx.lineWidth = 0.55
  ctx.stroke()

  if (wet > 0.01) {
    ctx.beginPath()
    ctx.moveTo(0, snowY(0) + 1)
    for (let i = 1; i < snow.length; i++) {
      const x = Math.min(width, i * 6)
      ctx.lineTo(x, snowY(i) + 1)
    }
    ctx.strokeStyle = `rgba(177, 198, 211, ${Math.min(0.055, wet * 0.055)})`
    ctx.lineWidth = 0.7
    ctx.stroke()
  }
}


