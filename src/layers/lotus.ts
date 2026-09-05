export type LotusState = 'shoot' | 'bud' | 'opening' | 'open' | 'closing' | 'sinking' | 'burning' | 'charred'

export type Lotus = {
  id: number
  x: number
  scale: number
  hue: number
  state: LotusState
  stateStarted: number
  riseDuration: number
  openDuration: number
  closeDuration: number
  burnSeed: number
}

const TAU = Math.PI * 2

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value))
}

function smoothstep(value: number) {
  const t = clamp01(value)
  return t * t * (3 - 2 * t)
}

function seededUnit(seed: number) {
  const value = Math.sin(seed * 12.9898 + 78.233) * 43758.5453
  return value - Math.floor(value)
}

function drawPetal(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  length: number,
  width: number,
  angle: number,
  alpha: number,
  redBias: number,
) {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(angle)
  ctx.beginPath()
  ctx.moveTo(0, 0)
  ctx.bezierCurveTo(-width * 0.72, -length * 0.25, -width * 0.62, -length * 0.78, 0, -length)
  ctx.bezierCurveTo(width * 0.62, -length * 0.78, width * 0.72, -length * 0.25, 0, 0)
  ctx.closePath()
  ctx.fillStyle = redBias < -50
    ? `rgba(48, 42, 36, ${alpha})`
    : `rgba(${232 + redBias}, ${226 - redBias * 0.22}, ${228 + redBias * 0.1}, ${alpha})`
  ctx.fill()
  ctx.restore()
}

function drawLotusBud(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  s: number,
  alpha: number,
  redBias: number,
  emergence = 1,
) {
  const budLength = (10.4 + emergence * 2.6) * s
  const budWidth = (2.35 + emergence * 0.6) * s
  const sheathAlpha = alpha * (0.72 + emergence * 0.18)
  drawPetal(ctx, x, y + 0.55 * s, budLength * 0.98, budWidth * 0.94, -0.12, sheathAlpha * 0.82, redBias - 4)
  drawPetal(ctx, x, y + 0.55 * s, budLength * 0.98, budWidth * 0.94, 0.12, sheathAlpha * 0.82, redBias - 4)
  drawPetal(ctx, x, y, budLength * 1.08, budWidth, 0, alpha, redBias + 1)

  ctx.save()
  ctx.strokeStyle = `rgba(243, 237, 240, ${alpha * 0.16})`
  ctx.lineWidth = Math.max(0.55, 0.68 * s)
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(x, y - budLength * 0.18)
  ctx.quadraticCurveTo(x + 0.16 * s, y - budLength * 0.46, x, y - budLength * 0.82)
  ctx.stroke()
  ctx.restore()
}

export function drawLotus(
  ctx: CanvasRenderingContext2D,
  lotus: Lotus,
  waterY: number,
  now: number,
  lightningFlash: number,
) {
  const elapsed = now - lotus.stateStarted
  if (elapsed < 0) return
  let visible = 1
  let openness = 0
  let stemT = 1
  let budVisible = 1

  if (lotus.state === 'shoot') {
    visible = smoothstep(elapsed / 2200)
    stemT = smoothstep(elapsed / lotus.riseDuration)
    budVisible = smoothstep((stemT - 0.58) / 0.42)
  } else if (lotus.state === 'bud') {
    openness = 0
  } else if (lotus.state === 'opening') {
    openness = smoothstep(elapsed / lotus.openDuration)
  } else if (lotus.state === 'open') {
    openness = 1
  } else if (lotus.state === 'closing') {
    openness = 1 - smoothstep(elapsed / lotus.closeDuration)
  } else if (lotus.state === 'sinking') {
    const retreat = smoothstep(elapsed / 8000)
    stemT = 1 - retreat
    visible = 1 - retreat
  } else if (lotus.state === 'burning') {
    openness = 1
  } else if (lotus.state === 'charred') {
    openness = 0.42
    visible = 1 - smoothstep(elapsed / 3600)
  }

  if (visible <= 0) return

  const s = lotus.scale
  const stemHeight = 12.4 * s
  const bloomLift = 1.4 * s
  const budBaseY = waterY - stemHeight * stemT - bloomLift
  const flowerY = budBaseY - 0.5 * s
  // Less than a pixel of slow movement: the stem stays rooted in the water.
  const flowerX = lotus.x + Math.sin(now * 0.00035 + lotus.burnSeed) * 0.65 * s * stemT
  const padAlpha = 0.06 + lightningFlash * 0.11
  ctx.save()
  ctx.globalAlpha = visible

  ctx.beginPath()
  ctx.ellipse(lotus.x, waterY + 1.2, 13.5 * s, 3.7 * s, -0.08, 0, TAU)
  ctx.fillStyle = `rgba(62, 86, 72, ${padAlpha})`
  ctx.fill()

  if (stemT > 0.02) {
    const stemAlpha = 0.12 + lightningFlash * 0.09
    ctx.strokeStyle = `rgba(102, 128, 110, ${stemAlpha})`
    ctx.lineWidth = Math.max(0.7, 1.05 * s)
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(lotus.x, waterY + 0.4)
    ctx.quadraticCurveTo(lotus.x + 0.65 * s, waterY - stemHeight * stemT * 0.38, flowerX, budBaseY + 0.1 * s)
    ctx.stroke()
  }

  if (lotus.state === 'burning' || lotus.state === 'charred') {
    const charAlpha = lotus.state === 'burning' ? 0.7 : 0.52 * visible
    for (let i = 0; i < 7; i++) {
      drawPetal(
        ctx,
        lotus.x,
        flowerY,
        (9 + (i % 3) * 1.35) * s,
        3.5 * s,
        -0.72 + (i / 6) * 1.44,
        charAlpha,
        -115,
      )
    }

    if (lotus.state === 'burning') {
      const burnT = clamp01(elapsed / 4200)
      const flicker = 0.78 + Math.sin(now * 0.021 + lotus.burnSeed) * 0.16 + seededUnit(Math.floor(now / 90) + lotus.id) * 0.08
      const flameH = (7 + (1 - burnT) * 7) * s * flicker
      const flameW = (3.2 + (1 - burnT) * 1.8) * s
      const grad = ctx.createRadialGradient(lotus.x, flowerY - flameH * 0.35, 0.4, lotus.x, flowerY - flameH * 0.35, flameH)
      grad.addColorStop(0, `rgba(255, 226, 132, ${0.56 * (1 - burnT)})`)
      grad.addColorStop(0.34, `rgba(255, 126, 52, ${0.46 * (1 - burnT)})`)
      grad.addColorStop(1, 'rgba(146, 33, 16, 0)')
      ctx.fillStyle = grad
      ctx.beginPath()
      ctx.ellipse(lotus.x, flowerY - flameH * 0.34, flameW, flameH * 0.62, 0, 0, TAU)
      ctx.fill()
    }

    ctx.restore()
    return
  }

  const redBias = lotus.hue
  const budAlpha = 0.22 + lightningFlash * 0.14
  const bloomAlpha = 0.18 + openness * 0.20 + lightningFlash * 0.16

  if (lotus.state === 'shoot') {
    if (budVisible > 0.01) drawLotusBud(ctx, flowerX, budBaseY, s, budAlpha * budVisible, redBias, budVisible)
    ctx.restore()
    return
  }

  // A shared crossfade in both directions keeps the first opening frame and
  // the last closing frame identical to the resting bud.
  const petalReveal = smoothstep(openness / 0.34)
  if (petalReveal < 1) {
    drawLotusBud(ctx, flowerX, budBaseY, s, budAlpha * (1 - petalReveal), redBias)
  }
  if (petalReveal <= 0) {
    ctx.restore()
    return
  }

  const spread = 0.15 + openness * 0.88
  const petalLift = (1 - openness) * 0.5 * s

  for (let i = 0; i < 5; i++) {
    const u = i / 4
    const angle = (-1.12 + u * 2.24) * spread
    drawPetal(ctx, flowerX, flowerY + petalLift, (9.9 + openness * (3.8 - Math.abs(u - 0.5) * 3)) * s, 3.4 * s, angle, bloomAlpha * 0.62 * petalReveal, redBias)
  }
  for (let i = 0; i < 4; i++) {
    const u = i / 3
    const angle = (-0.64 + u * 1.28) * spread
    drawPetal(ctx, flowerX, flowerY + 0.65 * s + petalLift * 0.65, (8.5 + openness * 2.9) * s, 3.05 * s, angle, bloomAlpha * petalReveal, redBias + 4)
  }

  if (openness > 0.5) {
    ctx.beginPath()
    ctx.arc(flowerX, flowerY - 1.35 * s, 1.22 * s, 0, TAU)
    ctx.fillStyle = `rgba(247, 210, 126, ${(openness - 0.5) * 0.3 + lightningFlash * 0.12})`
    ctx.fill()
  }

  ctx.restore()
}


/** Return false only after the final fade; state boundaries carry their exact time. */
export function advanceLotus(lotus: Lotus, now: number, wetWeather: boolean) {
  const elapsed = now - lotus.stateStarted
  if (elapsed < 0) return true
  const enter = (state: LotusState, duration: number) => {
    lotus.state = state
    lotus.stateStarted += duration
  }
  if (lotus.state === 'shoot' && elapsed >= lotus.riseDuration) {
    enter('bud', lotus.riseDuration)
  } else if (lotus.state === 'bud') {
    if (wetWeather && elapsed >= 2600) enter('opening', 2600)
    else if (!wetWeather && elapsed >= 7000) enter('sinking', 7000)
  } else if (lotus.state === 'opening' && elapsed >= lotus.openDuration) {
    enter(wetWeather ? 'open' : 'closing', lotus.openDuration)
  } else if (lotus.state === 'open' && !wetWeather) {
    lotus.state = 'closing'
    lotus.stateStarted = now
  } else if (lotus.state === 'closing' && elapsed >= lotus.closeDuration) {
    enter('bud', lotus.closeDuration)
  } else if (lotus.state === 'burning' && elapsed >= 4200) {
    enter('charred', 4200)
  } else if ((lotus.state === 'sinking' && elapsed >= 8000) || (lotus.state === 'charred' && elapsed >= 3600)) {
    return false
  }
  return true
}
