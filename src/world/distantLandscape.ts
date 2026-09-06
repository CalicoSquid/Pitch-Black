import { worldBaseY } from './worldState'

export function seededFrac(seed: number) {
  const n = Math.sin(seed * 127.1 + 311.7) * 43758.5453123
  return n - Math.floor(n)
}

export function clamp01(value: number) {
  return Math.max(0, Math.min(1, value))
}

export function smoothStep(value: number) {
  return value * value * (3 - 2 * value)
}

export function smoothPulse(edge0: number, edge1: number, edge2: number, edge3: number, x: number) {
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

export function fbm2D(x: number, y: number, seed: number) {
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



function ridgeFeature(nx: number, center: number, halfWidth: number, amplitude: number) {
  const distance = Math.abs(nx - center) / Math.max(0.001, halfWidth)
  if (distance >= 1) return 0
  return amplitude * smoothStep(1 - distance)
}

export function distantRidgeY(x: number, width: number, height: number, layer: 'far' | 'mid' | 'near') {
  const nx = x / Math.max(1, width)

  // The noise is deliberately restrained. A few broad, fixed landforms do most
  // of the composition work so the horizon reads as geography rather than as a
  // uniformly noisy waveform when dawn reveals it for several minutes.
  if (layer === 'far') {
    const broad = fbm2D(nx * 1.08 + 2.4, 3.1, 143.7)
    const detail = fbm2D(nx * 2.9 + 6.8, 1.9, 211.3)
    const composed =
      ridgeFeature(nx, 0.17, 0.31, -0.017) +
      ridgeFeature(nx, 0.49, 0.24, 0.006) +
      ridgeFeature(nx, 0.81, 0.28, -0.014) +
      ridgeFeature(nx, 0.36, 0.085, -0.004) +
      ridgeFeature(nx, 0.61, 0.075, -0.003)
    return height * (0.650 + broad * 0.011 + detail * 0.0045 + composed)
  }

  if (layer === 'mid') {
    const broad = fbm2D(nx * 1.42 + 5.9, 2.5, 317.9)
    const detail = fbm2D(nx * 4.3 + 1.2, 6.4, 401.6)
    const composed =
      ridgeFeature(nx, 0.30, 0.22, -0.020) +
      ridgeFeature(nx, 0.58, 0.20, 0.006) +
      ridgeFeature(nx, 0.77, 0.18, -0.011) +
      ridgeFeature(nx, 0.12, 0.10, -0.004) +
      ridgeFeature(nx, 0.44, 0.085, 0.003) +
      ridgeFeature(nx, 0.90, 0.095, -0.005)
    return height * (0.708 + broad * 0.014 + detail * 0.006 + composed)
  }

  const broad = fbm2D(nx * 1.72 + 8.7, 2.1, 517.3)
  const detail = fbm2D(nx * 5.1 + 4.2, 4.6, 611.8)
  const composed =
    ridgeFeature(nx, 0.20, 0.16, -0.014) +
    ridgeFeature(nx, 0.43, 0.17, 0.005) +
    ridgeFeature(nx, 0.66, 0.19, -0.013) +
    ridgeFeature(nx, 0.88, 0.13, 0.004) +
    ridgeFeature(nx, 0.31, 0.07, -0.004) +
    ridgeFeature(nx, 0.53, 0.065, 0.0035) +
    ridgeFeature(nx, 0.79, 0.075, -0.005)
  return height * (0.763 + broad * 0.017 + detail * 0.007 + composed)
}

function drawConifer(
  ctx: CanvasRenderingContext2D,
  x: number,
  baseY: number,
  height: number,
  width: number,
  lean: number,
  alpha: number,
  shapeSeed: number,
) {
  const topX = x + lean * height * 0.09
  const leftBias = 0.88 + seededFrac(shapeSeed + 1.7) * 0.22
  const rightBias = 0.88 + seededFrac(shapeSeed + 4.3) * 0.22
  const crownTuck = 0.82 + seededFrac(shapeSeed + 8.1) * 0.14
  const lowerSpread = 0.90 + seededFrac(shapeSeed + 11.6) * 0.16

  ctx.save()
  ctx.fillStyle = `rgba(0, 1, 2, ${alpha})`
  ctx.beginPath()
  ctx.moveTo(topX, baseY - height)
  // Uneven branch shelves keep these tiny silhouettes from reading like the same
  // icon stamped along the ridge, while remaining a single inexpensive path.
  ctx.lineTo(x - width * 0.20 * leftBias, baseY - height * 0.80)
  ctx.lineTo(x - width * 0.12, baseY - height * 0.72)
  ctx.lineTo(x - width * 0.48 * leftBias, baseY - height * 0.59)
  ctx.lineTo(x - width * 0.20, baseY - height * 0.55)
  ctx.lineTo(x - width * 0.70 * leftBias * crownTuck, baseY - height * 0.39)
  ctx.lineTo(x - width * 0.28, baseY - height * 0.34)
  ctx.lineTo(x - width * 0.96 * leftBias * lowerSpread, baseY - height * 0.17)
  ctx.lineTo(x - width * 0.16, baseY - height * 0.13)
  ctx.lineTo(x - width * 0.07, baseY + 0.8)
  ctx.lineTo(x + width * 0.07, baseY + 0.8)
  ctx.lineTo(x + width * 0.15, baseY - height * 0.13)
  ctx.lineTo(x + width * 0.91 * rightBias * lowerSpread, baseY - height * 0.19)
  ctx.lineTo(x + width * 0.26, baseY - height * 0.34)
  ctx.lineTo(x + width * 0.66 * rightBias * crownTuck, baseY - height * 0.42)
  ctx.lineTo(x + width * 0.18, baseY - height * 0.56)
  ctx.lineTo(x + width * 0.43 * rightBias, baseY - height * 0.62)
  ctx.lineTo(x + width * 0.11, baseY - height * 0.73)
  ctx.lineTo(x + width * 0.22 * rightBias, baseY - height * 0.81)
  ctx.closePath()
  ctx.fill()
  ctx.restore()
}

export function drawDistantDepth(ctx: CanvasRenderingContext2D, width: number, height: number, power: number, dawn = false) {
  const reveal = smoothStep(clamp01(power))
  if (reveal < 0.002) return

  const foregroundY = worldBaseY(height)
  const landscapeFloor = Math.max(height * 0.79, foregroundY - 7)
  const shortLandscape = width > height * 1.35 && height <= 520

  ctx.save()

  // Keep the reveal concentrated around the horizon so the eye reads newly
  // discovered space, not a second generic lightning wash.
  const horizonGlow = ctx.createLinearGradient(0, height * 0.47, 0, foregroundY)
  if (dawn) {
    horizonGlow.addColorStop(0, 'rgba(198, 126, 99, 0)')
    horizonGlow.addColorStop(0.38, `rgba(198, 126, 99, ${0.018 * reveal})`)
    horizonGlow.addColorStop(0.70, `rgba(222, 157, 113, ${0.055 * reveal})`)
    horizonGlow.addColorStop(1, `rgba(104, 76, 79, ${0.012 * reveal})`)
  } else {
    horizonGlow.addColorStop(0, 'rgba(153, 170, 183, 0)')
    horizonGlow.addColorStop(0.35, `rgba(153, 170, 183, ${0.028 * reveal})`)
    horizonGlow.addColorStop(0.66, `rgba(176, 191, 202, ${0.110 * reveal})`)
    horizonGlow.addColorStop(1, `rgba(144, 159, 171, ${0.022 * reveal})`)
  }
  ctx.fillStyle = horizonGlow
  ctx.fillRect(0, height * 0.46, width, Math.max(1, foregroundY - height * 0.46))

  const drawRidge = (layer: 'far' | 'mid' | 'near', step: number, fill: string) => {
    const points: Array<{ x: number; y: number }> = []
    for (let x = 0; x <= width + step; x += step) {
      const px = Math.min(width, x)
      points.push({ x: px, y: distantRidgeY(px, width, height, layer) })
      if (px === width) break
    }

    ctx.beginPath()
    ctx.moveTo(0, landscapeFloor)
    if (points.length > 0) {
      ctx.lineTo(points[0].x, points[0].y)
      for (let i = 1; i < points.length; i++) {
        const previous = points[i - 1]
        const current = points[i]
        const midX = (previous.x + current.x) * 0.5
        const midY = (previous.y + current.y) * 0.5
        ctx.quadraticCurveTo(previous.x, previous.y, midX, midY)
      }
      const last = points[points.length - 1]
      ctx.lineTo(last.x, last.y)
    }
    ctx.lineTo(width, landscapeFloor)
    ctx.closePath()
    ctx.fillStyle = fill
    ctx.fill()
  }

  const farReveal = smoothStep(clamp01((reveal - 0.16) / 0.84))
  const midReveal = smoothStep(clamp01((reveal - 0.06) / 0.94))

  if (farReveal > 0.01) {
    drawRidge('far', Math.max(8, width / 110), dawn ? 'rgb(54, 39, 45)' : `rgba(28, 33, 37, ${0.16 * farReveal})`)
  }
  if (midReveal > 0.01) {
    drawRidge('mid', Math.max(7, width / 130), dawn ? 'rgb(26, 25, 32)' : `rgba(13, 16, 19, ${0.30 * midReveal})`)
  }
  drawRidge('near', Math.max(6, width / 150), dawn ? 'rgb(5, 9, 12)' : `rgba(1, 2, 3, ${0.90 * reveal})`)

  // Add a very subtle atmospheric shelf between the two most distant bands so the
  // reveal feels like depth receding into darkness rather than one flat backdrop.
  if (farReveal > 0.01) {
    const haze = ctx.createLinearGradient(0, height * 0.56, 0, height * 0.79)
    if (dawn) {
      haze.addColorStop(0, `rgba(220, 158, 122, ${0.020 * farReveal})`)
      haze.addColorStop(0.50, `rgba(154, 112, 108, ${0.014 * farReveal})`)
      haze.addColorStop(1, 'rgba(105, 93, 103, 0)')
    } else {
      haze.addColorStop(0, `rgba(190, 200, 208, ${0.014 * farReveal})`)
      haze.addColorStop(0.55, `rgba(145, 158, 170, ${0.010 * farReveal})`)
      haze.addColorStop(1, 'rgba(145, 158, 170, 0)')
    }
    ctx.fillStyle = haze
    ctx.fillRect(0, height * 0.55, width, foregroundY - height * 0.55)
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
      drawConifer(ctx, x, baseY, treeHeight, treeWidth, lean, alpha, 1501.2 + c * 53.7 + i * 17.1)
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
    drawConifer(ctx, x, ridgeY, treeHeight, treeWidth, lean, alpha, 1951.4 + i * 61.3)
  }

  if (dawn) {
    const shadow = ctx.createLinearGradient(0, landscapeFloor, 0, height);
    shadow.addColorStop(0, 'rgb(6, 10, 13)');
    shadow.addColorStop(1, '#000');
    ctx.fillStyle = shadow;
    ctx.fillRect(0, landscapeFloor - 1, width, height - landscapeFloor + 1);
  }
  ctx.restore()
}

