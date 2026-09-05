import { canvasPixelRatio } from '../rendering/canvasBudget'
import { useEffect, useRef } from 'react'
import type { Scene } from '../types'
import { ambientLanternSignal, ambientTrainSignal } from '../world/ambientLifeSignal'
import { ensureWorld, pitchWorld, standingWaterSurfaceY, worldIndexAt } from '../world/worldState'
import {
  createTerrainRenderCache,
  drawFrozenSkin,
  drawStandingWater,
  drawTerrain,
  invalidateTerrainRenderCache,
  type TerrainRenderCache,
} from '../world/worldRendering'

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value))
}

function smoothStep(value: number) {
  const t = clamp01(value)
  return t * t * (3 - 2 * t)
}

function seeded(seed: number) {
  const n = Math.sin(seed * 12.9898 + 78.233) * 43758.5453
  return n - Math.floor(n)
}

function trainRouteNormAt(progress: number) {
  const eased = smoothStep(progress)
  const base = ambientTrainSignal.startY + ambientTrainSignal.travelY * eased
  // The route should sit low in the frame and feel like it runs along a distant
  // hillside shelf, not like it is climbing through open sky.
  const shelfCurve = Math.sin(progress * Math.PI) * -0.0030
  const contour = Math.sin(progress * Math.PI * 1.9 + 0.35) * 0.0019
    + Math.sin(progress * Math.PI * 4.2 + 0.9) * 0.0009
  return base + shelfCurve + contour
}

function trainRouteY(height: number) {
  return height * trainRouteNormAt(ambientTrainSignal.progress)
}

function trainValleyRidgeY(x: number, width: number, height: number) {
  const direction = ambientTrainSignal.direction
  const q = clamp01(direction > 0 ? x / Math.max(1, width) : 1 - x / Math.max(1, width))
  const seed = ambientTrainSignal.id * 0.109 + 7.6
  const routeNorm = trainRouteNormAt(q)
  const ridgeLift = 0.035
    + Math.exp(-Math.pow((q - 0.18) / 0.18, 2)) * 0.006
    + Math.exp(-Math.pow((q - 0.52) / 0.22, 2)) * 0.010
    + Math.exp(-Math.pow((q - 0.83) / 0.17, 2)) * 0.008
  const contour = Math.sin(q * Math.PI * 2.1 + seed) * 0.0036
    + Math.sin(q * Math.PI * 5.0 + seed * 1.7) * 0.0015
  return height * (routeNorm - ridgeLift + contour)
}

function trainOcclusionY(x: number, width: number, height: number) {
  const direction = ambientTrainSignal.direction
  const q = clamp01(direction > 0 ? x / Math.max(1, width) : 1 - x / Math.max(1, width))
  const seed = ambientTrainSignal.id * 0.137 + 3.9
  const routeNorm = trainRouteNormAt(q)
  // The line below is not a visible drawing; it is the hidden contour that allows
  // the train to emerge from a ridge, cross a short exposed valley section, dip
  // behind another hill, then finally be swallowed by the far land.
  const shelteredShelf = 0.013
  const startHill = Math.exp(-Math.pow((q - 0.14) / 0.10, 2)) * 0.030
  const midExpose = Math.exp(-Math.pow((q - 0.40) / 0.10, 2)) * 0.012
  const middleHill = Math.exp(-Math.pow((q - 0.60) / 0.10, 2)) * 0.022
  const finalRise = smoothStep((q - 0.79) / 0.17) * 0.060
  const contour = Math.sin(q * Math.PI * 2.7 + seed) * 0.0026
    + Math.sin(q * Math.PI * 6.1 + seed * 1.8) * 0.0012
  return height * (routeNorm + shelteredShelf + midExpose - startHill - middleHill - finalRise + contour)
}


function trainWorldXAt(progress: number, width: number) {
  const direction = ambientTrainSignal.direction
  const startX = direction > 0 ? -width * 0.20 : width * 1.20
  const endX = direction > 0 ? width * 1.04 : -width * 0.04
  return startX + (endX - startX) * smoothStep(progress)
}

function drawTrainValleyMask(ctx: CanvasRenderingContext2D, width: number, height: number) {
  if (!ambientTrainSignal.active || ambientTrainSignal.alpha < 0.002) return

  // This matte shape is almost invisible against the black screen, but because the
  // world canvas sits above the star field it removes a shallow band of stars and
  // quietly establishes a distant valley / hillside shelf for the train to inhabit.
  ctx.save()
  ctx.globalAlpha = Math.min(1, ambientTrainSignal.alpha * 1.18)
  ctx.fillStyle = 'rgba(0, 0, 0, 0.98)'
  ctx.beginPath()
  ctx.moveTo(0, height)
  ctx.lineTo(0, trainValleyRidgeY(0, width, height))
  for (let sampleX = 0; sampleX <= width; sampleX += Math.max(16, width / 60)) {
    ctx.lineTo(sampleX, trainValleyRidgeY(sampleX, width, height))
  }
  ctx.lineTo(width, height)
  ctx.closePath()
  ctx.fill()
  ctx.restore()
}

function drawAmbientTrain(ctx: CanvasRenderingContext2D, width: number, height: number) {
  if (!ambientTrainSignal.active || ambientTrainSignal.alpha < 0.002) return

  const direction = ambientTrainSignal.direction
  const scaleForViewport = Math.max(0.80, Math.min(1.12, width / 1180))
  const scale = ambientTrainSignal.scale * scaleForViewport
  const x = ambientTrainSignal.x
  const y = trainRouteY(height)
  const seed = ambientTrainSignal.id * 17.31 + 4.7
  const carriageCount = 4 + Math.floor(seeded(seed + 8.1) * 2)
  const bodyHeight = 15.4
  const roofY = -bodyHeight * 0.56
  const floorY = bodyHeight * 0.44
  const coachLength = 38.5
  const coachGap = 3.6
  const locoLength = 47.5
  const couplerGap = 5.2

  const p0 = clamp01(ambientTrainSignal.progress - 0.006)
  const p1 = clamp01(ambientTrainSignal.progress + 0.006)
  const y0 = height * trainRouteNormAt(p0)
  const y1 = height * trainRouteNormAt(p1)
  const xSpan = Math.max(1, Math.abs(trainWorldXAt(p1, width) - trainWorldXAt(p0, width)))
  const rawRouteAngle = Math.atan((y1 - y0) / xSpan) * direction
  const routeAngle = Math.max(-0.028, Math.min(0.028, rawRouteAngle))

  ctx.save()
  ctx.beginPath()
  ctx.moveTo(0, 0)
  ctx.lineTo(width, 0)
  ctx.lineTo(width, trainOcclusionY(width, width, height))
  for (let sampleX = width; sampleX >= 0; sampleX -= Math.max(18, width / 54)) {
    ctx.lineTo(sampleX, trainOcclusionY(sampleX, width, height))
  }
  ctx.lineTo(0, 0)
  ctx.closePath()
  ctx.clip()

  ctx.translate(x, y)
  ctx.rotate(routeAngle)
  ctx.scale(direction * scale, scale)
  ctx.globalAlpha = ambientTrainSignal.alpha
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'

  const roundedRectPath = (rx: number, ry: number, rw: number, rh: number, radius: number) => {
    const r = Math.min(radius, Math.abs(rw) * 0.5, Math.abs(rh) * 0.5)
    ctx.beginPath()
    ctx.moveTo(rx + r, ry)
    ctx.lineTo(rx + rw - r, ry)
    ctx.quadraticCurveTo(rx + rw, ry, rx + rw, ry + r)
    ctx.lineTo(rx + rw, ry + rh - r)
    ctx.quadraticCurveTo(rx + rw, ry + rh, rx + rw - r, ry + rh)
    ctx.lineTo(rx + r, ry + rh)
    ctx.quadraticCurveTo(rx, ry + rh, rx, ry + rh - r)
    ctx.lineTo(rx, ry + r)
    ctx.quadraticCurveTo(rx, ry, rx + r, ry)
    ctx.closePath()
  }

  const drawWindow = (wx: number, wy: number, ww: number, wh: number, warmth: number) => {
    ctx.fillStyle = `rgba(180, 112, 54, ${0.12 * warmth})`
    roundedRectPath(wx - 0.8, wy - 0.55, ww + 1.6, wh + 1.15, 1.0)
    ctx.fill()
    ctx.fillStyle = `rgba(232, 165, 87, ${0.76 * warmth})`
    roundedRectPath(wx, wy, ww, wh, 0.72)
    ctx.fill()
    ctx.fillStyle = `rgba(255, 223, 160, ${0.16 * warmth})`
    roundedRectPath(wx + 0.45, wy + 0.4, Math.max(0.8, ww - 0.95), 0.72, 0.32)
    ctx.fill()
  }

  // Electric locomotive: distinct, but still mostly inferred. Boxier body,
  // slight roof equipment and one tiny headlamp make it feel like a real train
  // rather than generic glowing carriages.
  ctx.fillStyle = 'rgba(13, 16, 17, 0.88)'
  ctx.beginPath()
  ctx.moveTo(-locoLength + 1.4, floorY + 0.55)
  ctx.lineTo(-locoLength + 1.4, roofY + 2.2)
  ctx.quadraticCurveTo(-locoLength + 3.0, roofY - 0.55, -locoLength + 8.6, roofY - 1.15)
  ctx.lineTo(-10.8, roofY - 1.15)
  ctx.lineTo(-7.2, roofY - 0.95)
  ctx.lineTo(-1.2, -4.4)
  ctx.quadraticCurveTo(2.0, -2.4, 1.2, 1.8)
  ctx.lineTo(0.5, floorY + 0.2)
  ctx.quadraticCurveTo(0.4, floorY + 0.7, -1.3, floorY + 0.78)
  ctx.lineTo(-locoLength + 3.0, floorY + 0.78)
  ctx.quadraticCurveTo(-locoLength + 1.4, floorY + 0.64, -locoLength + 1.4, floorY + 0.55)
  ctx.closePath()
  ctx.fill()

  ctx.strokeStyle = 'rgba(42, 47, 48, 0.22)'
  ctx.lineWidth = 0.92
  ctx.beginPath()
  ctx.moveTo(-locoLength + 6.5, roofY)
  ctx.lineTo(-12.0, roofY)
  ctx.stroke()

  ctx.fillStyle = 'rgba(3, 5, 5, 0.96)'
  roundedRectPath(-locoLength + 1.8, floorY - 0.15, locoLength - 2.0, 2.45, 0.7)
  ctx.fill()

  // Subtle pantograph / roof gear silhouette.
  ctx.strokeStyle = 'rgba(18, 21, 21, 0.78)'
  ctx.lineWidth = 0.7
  ctx.beginPath()
  ctx.moveTo(-31.0, roofY - 0.4)
  ctx.lineTo(-28.8, roofY - 4.1)
  ctx.lineTo(-24.8, roofY - 0.45)
  ctx.moveTo(-29.9, roofY - 2.2)
  ctx.lineTo(-23.8, roofY - 2.2)
  ctx.stroke()

  drawWindow(-39.6, -4.15, 4.3, 5.25, 0.70)
  drawWindow(-33.2, -4.15, 4.3, 5.25, 0.86)
  drawWindow(-23.4, -4.0, 4.85, 5.15, 0.66)
  drawWindow(-15.8, -3.95, 4.3, 5.15, 0.58)
  ctx.fillStyle = 'rgba(255, 229, 176, 0.18)'
  roundedRectPath(-0.05, -1.45, 1.2, 2.0, 0.52)
  ctx.fill()

  const coachStartRight = -locoLength - couplerGap
  for (let carriage = 0; carriage < carriageCount; carriage += 1) {
    const carRight = coachStartRight - carriage * (coachLength + coachGap)
    const carLeft = carRight - coachLength
    const localVariation = 0.90 + seeded(seed + carriage * 11.6) * 0.10
    const roofDip = seeded(seed + carriage * 5.1) * 0.6

    ctx.fillStyle = 'rgba(6, 8, 8, 0.95)'
    roundedRectPath(carRight, -3.4, coachGap + 0.85, 6.9, 1.1)
    ctx.fill()

    ctx.fillStyle = `rgba(14, 16, 17, ${0.84 * localVariation})`
    ctx.beginPath()
    ctx.moveTo(carLeft + 1.1, floorY + 0.6)
    ctx.lineTo(carLeft + 1.1, roofY + 2.2)
    ctx.quadraticCurveTo(carLeft + 3.2, roofY - 0.3 - roofDip, carLeft + 8.0, roofY - 1.0 - roofDip)
    ctx.lineTo(carRight - 6.0, roofY - 1.0 - roofDip)
    ctx.quadraticCurveTo(carRight - 1.8, roofY - 0.42 - roofDip * 0.5, carRight - 0.85, roofY + 2.1)
    ctx.lineTo(carRight - 0.85, floorY + 0.55)
    ctx.quadraticCurveTo(carRight - 0.95, floorY + 0.85, carRight - 2.1, floorY + 0.85)
    ctx.lineTo(carLeft + 2.6, floorY + 0.85)
    ctx.quadraticCurveTo(carLeft + 1.1, floorY + 0.75, carLeft + 1.1, floorY + 0.6)
    ctx.closePath()
    ctx.fill()

    ctx.strokeStyle = `rgba(40, 44, 45, ${0.18 * localVariation})`
    ctx.lineWidth = 0.88
    ctx.beginPath()
    ctx.moveTo(carLeft + 3.8, roofY + 0.15)
    ctx.quadraticCurveTo(carLeft + 9.0, roofY - 1.08 - roofDip, carLeft + 13.2, roofY - 1.08 - roofDip)
    ctx.lineTo(carRight - 4.8, roofY - 1.08 - roofDip)
    ctx.stroke()

    ctx.fillStyle = 'rgba(4, 6, 6, 0.96)'
    roundedRectPath(carLeft + 1.25, floorY - 0.05, coachLength - 2.05, 2.3, 0.62)
    ctx.fill()

    for (let windowIndex = 0; windowIndex < 5; windowIndex += 1) {
      const occupied = seeded(seed + carriage * 31.7 + windowIndex * 7.1)
      const warmth = occupied < 0.12 ? 0.18 : occupied < 0.28 ? 0.46 : occupied < 0.48 ? 0.72 : 0.94
      const widthVariation = 4.1 + seeded(seed + carriage * 19.4 + windowIndex * 3.9) * 0.28
      drawWindow(carLeft + 3.1 + windowIndex * 6.7, -4.0, widthVariation, 5.18, warmth)
    }

    ctx.fillStyle = 'rgba(5, 6, 6, 0.98)'
    roundedRectPath(carLeft + 4.0, floorY + 0.72, 8.2, 1.95, 0.75)
    ctx.fill()
    roundedRectPath(carRight - 12.2, floorY + 0.72, 8.2, 1.95, 0.75)
    ctx.fill()
    ctx.beginPath()
    ctx.arc(carLeft + 6.7, floorY + 2.3, 2.05, 0, Math.PI * 2)
    ctx.arc(carLeft + 9.9, floorY + 2.3, 2.05, 0, Math.PI * 2)
    ctx.arc(carRight - 9.8, floorY + 2.3, 2.05, 0, Math.PI * 2)
    ctx.arc(carRight - 6.7, floorY + 2.3, 2.05, 0, Math.PI * 2)
    ctx.fill()

    if (carriage === carriageCount - 1) {
      ctx.fillStyle = 'rgba(188, 60, 46, 0.34)'
      roundedRectPath(carLeft + 0.95, -0.8, 0.8, 1.1, 0.35)
      ctx.fill()
      roundedRectPath(carLeft + 0.95, 1.2, 0.8, 1.1, 0.35)
      ctx.fill()
    }
  }

  ctx.restore()
}

function drawTrainTracksideCues(ctx: CanvasRenderingContext2D, width: number, height: number) {
  if (!ambientTrainSignal.active || ambientTrainSignal.alpha < 0.002) return

  ctx.save()
  ctx.globalAlpha = Math.min(1, ambientTrainSignal.alpha * 0.92)
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  const points = [0.22, 0.47, 0.73]
  points.forEach((q, index) => {
    const poleX = trainWorldXAt(q, width)
    if (poleX < -20 || poleX > width + 20) return
    const baseY = height * trainRouteNormAt(q)
    const ridgeY = trainValleyRidgeY(poleX, width, height)
    const topY = ridgeY - (13 + index * 2)

    ctx.strokeStyle = 'rgba(6, 8, 9, 0.94)'
    ctx.lineWidth = 1.05
    ctx.beginPath()
    ctx.moveTo(poleX, baseY + 1.4)
    ctx.lineTo(poleX, topY)
    ctx.stroke()

    ctx.lineWidth = 0.72
    ctx.beginPath()
    ctx.moveTo(poleX, topY + 1.4)
    ctx.lineTo(poleX + 5.5 * ambientTrainSignal.direction, topY + 1.4)
    ctx.stroke()

    ctx.fillStyle = 'rgba(10, 12, 12, 0.92)'
    ctx.fillRect(poleX - 0.7, topY + 2.2, 1.4, 1.6)
  })

  // One tiny fixed signal helps the eye lock the moving windows to land.
  const signalQ = 0.58
  const signalX = trainWorldXAt(signalQ, width)
  if (signalX >= -12 && signalX <= width + 12) {
    const signalBaseY = height * trainRouteNormAt(signalQ)
    const signalTopY = signalBaseY - 9.8
    ctx.strokeStyle = 'rgba(7, 8, 9, 0.96)'
    ctx.lineWidth = 1.0
    ctx.beginPath()
    ctx.moveTo(signalX, signalBaseY + 0.8)
    ctx.lineTo(signalX, signalTopY)
    ctx.stroke()
    ctx.fillStyle = 'rgba(84, 104, 82, 0.22)'
    ctx.beginPath()
    ctx.arc(signalX + 1.5 * ambientTrainSignal.direction, signalTopY + 1.8, 1.25, 0, Math.PI * 2)
    ctx.fill()
  }

  ctx.restore()
}


function drawAmbientLantern(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  cache: TerrainRenderCache,
) {
  if (!ambientLanternSignal.active || ambientLanternSignal.alpha < 0.002) return
  if (cache.groundY.length < 3 || cache.snowY.length < 3) return

  const signal = ambientLanternSignal
  const direction = signal.direction
  const scale = signal.scale * Math.max(0.92, Math.min(1.08, width / 1200))
  const seed = signal.id * 0.714 + direction * 0.22
  const stepPhase = signal.walking ? signal.stepPhase : 0
  const alternatingFoot = signal.stepIndex % 2 === 0 ? 1 : -1
  const stepSeed = seed + signal.stepIndex * 5.37
  const phaseSkew = (seeded(stepSeed + 11.2) - 0.5) * 0.11
  const gaitPhase = clamp01(stepPhase + phaseSkew * Math.sin(stepPhase * Math.PI))
  const transfer = Math.sin(gaitPhase * Math.PI)
  const plant = Math.cos(gaitPhase * Math.PI * 2)
  const reactionEnergy = signal.reaction === 'panic' ? 1.52 : signal.reaction === 'returning' ? 1.10 : 1
  const swayAmount = (0.72 + seeded(stepSeed + 3.8) * 0.56) * reactionEnergy
  const swingAmount = (0.68 + seeded(stepSeed + 7.1) * 0.72) * reactionEnergy
  const bobAmount = (0.72 + seeded(stepSeed + 9.6) * 0.50) * reactionEnergy
  const bodySway = alternatingFoot * transfer * swayAmount
  const handSwing = alternatingFoot * Math.sin(gaitPhase * Math.PI + 0.16 + phaseSkew) * swingAmount
  const handHeight = (15.6 + seeded(seed + 1.3) * 2.8) * scale
  const lanternOffsetX = direction * (4.4 + seeded(seed + 4.4) * 1.5) + handSwing * 1.72 * scale
  const startleJolt = signal.reaction === 'panic' && !signal.walking ? -1.9 * scale : 0
  const lanternBob = signal.walking
    ? (-transfer * 1.28 * bobAmount + plant * 0.18) * scale
    : 0.18 * Math.sin(signal.progress * Math.PI * 7.3 + seed) + startleJolt
  const centerX = signal.x
  const index = worldIndexAt(centerX, width)
  const groundY = cache.groundY[index]
  const snowY = cache.snowY[index]
  const waterY = standingWaterSurfaceY(height)
  const pooled = Number.isFinite(waterY) && groundY > waterY + 0.25
  const waterFill = pooled ? Math.max(0, Math.min(1, pitchWorld.water[index] * 0.55 + pitchWorld.waterLevel * 1.18)) : 0
  const iceFill = pooled ? Math.max(0, Math.min(1, pitchWorld.ice[index])) : 0
  let surfaceY = snowY
  if (pooled && Math.max(waterFill, iceFill) > 0.05) surfaceY = Math.min(surfaceY, waterY)

  const lanternX = centerX + lanternOffsetX
  const lanternY = surfaceY - handHeight + lanternBob
  const alpha = signal.alpha
  const warmAlpha = alpha * (0.74 + seeded(seed + 5.7) * 0.12)
  const coreRadius = (1.85 + seeded(seed + 8.2) * 0.24) * scale
  const glowRadius = coreRadius * 5.4

  ctx.save()
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  if (pooled && Math.max(waterFill, iceFill) > 0.05) {
    const reflectAlpha = alpha * (waterFill > iceFill ? 0.30 + waterFill * 0.18 : 0.15 + iceFill * 0.10)
    const reflectedY = waterY + (waterY - lanternY) * (waterFill > iceFill ? 0.94 : 0.84)
    const reflectRadius = glowRadius * (waterFill > iceFill ? 0.58 : 0.40)
    const reflectWidth = (4.8 + scale * 2.5) * (waterFill > iceFill ? 1 : 0.92)

    const reflectGlow = ctx.createRadialGradient(lanternX, reflectedY, 0, lanternX, reflectedY, reflectRadius)
    reflectGlow.addColorStop(0, `rgba(255, 214, 148, ${reflectAlpha * 0.20})`)
    reflectGlow.addColorStop(0.55, `rgba(236, 156, 72, ${reflectAlpha * 0.08})`)
    reflectGlow.addColorStop(1, 'rgba(0, 0, 0, 0)')
    ctx.fillStyle = reflectGlow
    ctx.beginPath()
    ctx.ellipse(lanternX, reflectedY, reflectWidth, Math.max(2.4, reflectRadius * 0.82), 0, 0, Math.PI * 2)
    ctx.fill()

    // Keep the reflection watery: broken horizontal glints only. A vertical line
    // reads as a glowing pole beneath the lantern rather than reflected light.
    const glintCount = waterFill > iceFill ? 3 : 2
    for (let glint = 0; glint < glintCount; glint += 1) {
      const depth = glint / Math.max(1, glintCount - 1)
      const glintY = waterY + 0.35 + depth * reflectRadius * 0.78
      const wobble = Math.sin(signal.progress * Math.PI * 13.2 + seed + glint * 2.1) * (0.8 + depth * 0.9) * scale
      const halfWidth = reflectWidth * (0.62 - depth * 0.17)
      ctx.strokeStyle = waterFill > iceFill
        ? `rgba(245, 193, 116, ${reflectAlpha * (0.42 - depth * 0.12)})`
        : `rgba(218, 229, 237, ${reflectAlpha * (0.24 - depth * 0.07)})`
      ctx.lineWidth = waterFill > iceFill ? 0.62 : 0.48
      ctx.beginPath()
      ctx.moveTo(lanternX - halfWidth + wobble, glintY)
      ctx.lineTo(lanternX - halfWidth * 0.18 + wobble * 0.35, glintY)
      ctx.moveTo(lanternX + halfWidth * 0.12 + wobble * 0.18, glintY)
      ctx.lineTo(lanternX + halfWidth * 0.78 + wobble, glintY)
      ctx.stroke()
    }
  }

  const groundGlow = ctx.createRadialGradient(centerX + direction * 1.4 * scale, surfaceY + 0.8, 0, centerX + direction * 1.4 * scale, surfaceY + 0.8, 14.5 * scale)
  groundGlow.addColorStop(0, `rgba(255, 193, 116, ${warmAlpha * 0.082})`)
  groundGlow.addColorStop(0.52, `rgba(229, 144, 67, ${warmAlpha * 0.032})`)
  groundGlow.addColorStop(1, 'rgba(0, 0, 0, 0)')
  ctx.fillStyle = groundGlow
  ctx.beginPath()
  ctx.ellipse(centerX + direction * 1.4 * scale, surfaceY + 0.8, 14.5 * scale, 4.6 * scale, 0, 0, Math.PI * 2)
  ctx.fill()

  // The carrier stays invisible. A narrow moving bite out of the lantern aura is
  // enough to imply a body occupying space without ever drawing a person sprite.
  ctx.fillStyle = `rgba(0, 0, 0, ${alpha * 0.34})`
  ctx.beginPath()
  ctx.ellipse(
    centerX - direction * 0.55 * scale + bodySway * 0.32 * scale,
    surfaceY - handHeight * 0.48,
    2.25 * scale,
    handHeight * 0.50,
    direction * -0.035,
    0,
    Math.PI * 2,
  )
  ctx.fill()

  ctx.strokeStyle = `rgba(31, 24, 14, ${alpha * 0.58})`
  ctx.lineWidth = 0.72 * scale
  ctx.beginPath()
  ctx.moveTo(centerX + direction * 0.35 * scale, surfaceY - handHeight * 0.60)
  ctx.lineTo(lanternX - direction * 0.20 * scale, lanternY + coreRadius * 0.55)
  ctx.stroke()

  ctx.strokeStyle = `rgba(40, 30, 18, ${alpha * 0.56})`
  ctx.lineWidth = 0.72 * scale
  ctx.beginPath()
  ctx.moveTo(lanternX - coreRadius * 0.72, lanternY - coreRadius * 0.92)
  ctx.quadraticCurveTo(lanternX, lanternY - coreRadius * 1.95, lanternX + coreRadius * 0.72, lanternY - coreRadius * 0.92)
  ctx.stroke()

  const glow = ctx.createRadialGradient(lanternX, lanternY, 0, lanternX, lanternY, glowRadius)
  glow.addColorStop(0, `rgba(255, 236, 194, ${warmAlpha * 0.88})`)
  glow.addColorStop(0.22, `rgba(255, 196, 116, ${warmAlpha * 0.46})`)
  glow.addColorStop(0.58, `rgba(236, 141, 56, ${warmAlpha * 0.12})`)
  glow.addColorStop(1, 'rgba(0, 0, 0, 0)')
  ctx.fillStyle = glow
  ctx.beginPath()
  ctx.arc(lanternX, lanternY, glowRadius, 0, Math.PI * 2)
  ctx.fill()

  ctx.fillStyle = `rgba(28, 20, 10, ${alpha * 0.62})`
  ctx.fillRect(lanternX - coreRadius * 0.92, lanternY - coreRadius * 1.10, coreRadius * 1.84, coreRadius * 2.1)
  ctx.fillStyle = `rgba(255, 204, 126, ${warmAlpha})`
  ctx.fillRect(lanternX - coreRadius * 0.46, lanternY - coreRadius * 0.60, coreRadius * 0.92, coreRadius * 1.22)
  ctx.fillStyle = `rgba(255, 244, 220, ${warmAlpha * 0.72})`
  ctx.fillRect(lanternX - coreRadius * 0.14, lanternY - coreRadius * 0.28, coreRadius * 0.28, coreRadius * 0.56)

  ctx.restore()
}

function drawTrainSnowReflection(
  ctx: CanvasRenderingContext2D,
  width: number,
  snowY: Float64Array,
) {
  if (!ambientTrainSignal.active || snowY.length < 3) return

  const centerX = ambientTrainSignal.x
  const span = Math.max(34, 82 * ambientTrainSignal.scale)
  const strength = ambientTrainSignal.alpha * (0.022 + ambientTrainSignal.scale * 0.014)
  if (strength < 0.002) return

  // A few warm traces on the snow surface are enough. No blur/filter pass: the
  // reflection stays cheap and reads as distant window light, not a spotlight.
  for (let offset = -span; offset <= span; offset += 7) {
    const x = centerX + offset
    if (x < 0 || x > width) continue
    const falloff = 1 - Math.min(1, Math.abs(offset) / span)
    const index = worldIndexAt(x, width)
    const y = snowY[index]
    const alpha = strength * falloff * falloff
    if (alpha < 0.001) continue
    ctx.beginPath()
    ctx.moveTo(x - 3.5, y + 0.2)
    ctx.lineTo(x + 3.5, y + 0.2)
    ctx.strokeStyle = `rgba(225, 166, 96, ${alpha})`
    ctx.lineWidth = 0.75 + falloff * 0.45
    ctx.stroke()
  }
}

export function WorldBaseScene({ scene }: { scene: Scene }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const sceneRef = useRef(scene)

  useEffect(() => {
    sceneRef.current = scene
  }, [scene])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let width = window.innerWidth
    let height = window.innerHeight
    let dpr = canvasPixelRatio(width, height, 1.5)
    let raf = 0
    let idleTimer = 0
    let last = performance.now()
    const minFrameMs = 30
    let light = sceneRef.current === 'snow' ? 1 : 0.82
    let idleCleared = false
    let materialTick = 0
    const terrainCache = createTerrainRenderCache()

    const resize = () => {
      width = window.innerWidth
      height = window.innerHeight
      dpr = canvasPixelRatio(width, height, 1.5)
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      invalidateTerrainRenderCache(terrainCache)
      ensureWorld(width, height)
    }

    const targetLight = () => {
      if (sceneRef.current === 'snow') return 1
      if (sceneRef.current === 'rain') return 0.82
      if (sceneRef.current === 'ember') return 0.42
      if (sceneRef.current === 'calm') return 0.58
      return 0
    }

    const draw = (time: number) => {
      raf = requestAnimationFrame(draw)
      const frameElapsed = time - last
      if (frameElapsed < minFrameMs) return

      const dt = Math.min(66, frameElapsed)
      last = time
      const blend = 1 - Math.exp(-dt / 950)
      light += (targetLight() - light) * blend

      // Standing water is aftermath, not a permanent terrain replacement. Even
      // untouched water slowly drains/evaporates over real time; frozen water
      // lingers longer. The water/ice surface remains one coherent level plane.
      const materialElapsed = Math.min(1000, frameElapsed)
      const dtSeconds = materialElapsed / 1000
      const currentScene = sceneRef.current
      if (currentScene !== 'rain' && (pitchWorld.waterLevel > 0 || pitchWorld.wetness > 0)) {
        const recessionPerSecond = currentScene === 'snow'
          ? 1 / 5400
          : currentScene === 'ember'
            ? 1 / 3600
            : 1 / 3000
        pitchWorld.waterLevel = Math.max(0, pitchWorld.waterLevel - recessionPerSecond * dtSeconds)
        pitchWorld.wetness = Math.max(0, pitchWorld.wetness - recessionPerSecond * dtSeconds * 0.55)
      }

      materialTick += materialElapsed
      if (materialTick >= 240) {
        const tickSeconds = materialTick / 1000
        materialTick = 0
        const waterDecay = currentScene === 'rain' ? 0 : currentScene === 'snow' ? 1 / 6200 : 1 / 3600
        if (waterDecay > 0) {
          const decay = Math.exp(-waterDecay * tickSeconds)
          for (let i = 0; i < pitchWorld.water.length; i++) {
            pitchWorld.water[i] = Math.max(0, pitchWorld.water[i] * decay)
          }
        }
      }

      if (light <= 0.008) {
        if (!idleCleared) {
          ctx.clearRect(0, 0, width, height)
          idleCleared = true
        }
        if (!ambientTrainSignal.active && !ambientLanternSignal.active) {
          cancelAnimationFrame(raf)
          idleTimer = window.setTimeout(() => {
            raf = requestAnimationFrame(draw)
          }, 220)
        }
        return
      }

      idleCleared = false
      ctx.clearRect(0, 0, width, height)
      drawTrainValleyMask(ctx, width, height)
      drawTerrain(ctx, width, height, light, time, pitchWorld.wetness, terrainCache)
      if (currentScene === 'snow') drawTrainSnowReflection(ctx, width, terrainCache.snowY)
      drawFrozenSkin(ctx, width, height, Math.max(0.20, light), terrainCache.groundY)
      drawStandingWater(ctx, width, height, Math.max(0.20, light), terrainCache.groundY)
      drawAmbientTrain(ctx, width, height)
      drawTrainTracksideCues(ctx, width, height)
      drawAmbientLantern(ctx, width, height, terrainCache)
    }

    resize()
    window.addEventListener('resize', resize)
    raf = requestAnimationFrame(draw)

    return () => {
      cancelAnimationFrame(raf)
      window.clearTimeout(idleTimer)
      window.removeEventListener('resize', resize)
    }
  }, [])

  return <canvas className="scene-canvas world-base-canvas" ref={canvasRef} aria-hidden="true" />
}

