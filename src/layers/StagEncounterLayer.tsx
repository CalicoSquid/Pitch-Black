import { useEffect, useRef } from 'react'
import { ensureWorld, surfaceYAt } from '../world/worldState'

type Encounter = {
  startedAt: number
  direction: 1 | -1
  pauseX: number
  startX: number
  endX: number
  scale: number
  seed: number
}

type SpriteKey = 'walk1' | 'walk2' | 'walk3' | 'walk4' | 'idle' | 'alert'

type SpriteSet = Record<SpriteKey, HTMLImageElement>

const SPRITE_WIDTH = 320
const SPRITE_HEIGHT = 220
const SPRITE_ANCHOR_X = 160
const SPRITE_ANCHOR_Y = 184

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

function svgDataUri(svg: string) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

function legPath(points: Array<[number, number]>) {
  return points.map(([x, y], index) => `${index === 0 ? 'M' : 'L'} ${x} ${y}`).join(' ') + ' Z'
}

function buildStagSvg(frame: SpriteKey) {
  const walkLegs: Record<'walk1' | 'walk2' | 'walk3' | 'walk4', string[]> = {
    walk1: [
      legPath([[82, 147], [92, 147], [98, 190], [92, 214], [86, 214], [88, 191]]),
      legPath([[109, 151], [118, 151], [114, 188], [103, 214], [97, 214], [106, 189]]),
      legPath([[203, 144], [212, 144], [201, 181], [188, 214], [182, 214], [193, 183]]),
      legPath([[228, 140], [237, 140], [244, 190], [239, 214], [232, 214], [232, 191]]),
    ],
    walk2: [
      legPath([[82, 147], [91, 147], [86, 183], [73, 214], [67, 214], [79, 184]]),
      legPath([[109, 151], [118, 151], [122, 191], [118, 214], [111, 214], [113, 192]]),
      legPath([[203, 144], [212, 144], [219, 188], [214, 214], [207, 214], [206, 188]]),
      legPath([[228, 140], [237, 140], [228, 180], [214, 214], [208, 214], [221, 180]]),
    ],
    walk3: [
      legPath([[82, 147], [92, 147], [98, 191], [94, 214], [87, 214], [88, 191]]),
      legPath([[109, 151], [119, 151], [113, 184], [100, 214], [94, 214], [106, 184]]),
      legPath([[203, 144], [212, 144], [204, 182], [191, 214], [184, 214], [196, 182]]),
      legPath([[228, 140], [237, 140], [244, 190], [239, 214], [232, 214], [233, 191]]),
    ],
    walk4: [
      legPath([[82, 147], [91, 147], [85, 179], [70, 214], [64, 214], [77, 180]]),
      legPath([[109, 151], [119, 151], [126, 189], [124, 214], [117, 214], [114, 190]]),
      legPath([[203, 144], [212, 144], [220, 189], [217, 214], [210, 214], [206, 189]]),
      legPath([[228, 140], [237, 140], [228, 179], [214, 214], [208, 214], [222, 180]]),
    ],
  }

  const idleLegs = [
    legPath([[84, 147], [93, 147], [95, 189], [93, 214], [86, 214], [88, 189]]),
    legPath([[111, 151], [120, 151], [118, 189], [117, 214], [110, 214], [112, 189]]),
    legPath([[205, 144], [214, 144], [212, 184], [210, 214], [203, 214], [205, 184]]),
    legPath([[230, 140], [239, 140], [239, 188], [238, 214], [231, 214], [231, 188]]),
  ]

  const alertLegs = [
    legPath([[85, 147], [94, 147], [95, 189], [94, 214], [87, 214], [88, 189]]),
    legPath([[111, 151], [120, 151], [117, 188], [115, 214], [108, 214], [112, 188]]),
    legPath([[206, 144], [215, 144], [214, 182], [214, 214], [206, 214], [206, 182]]),
    legPath([[231, 140], [240, 140], [243, 188], [243, 214], [236, 214], [233, 188]]),
  ]

  const neckPath =
    frame === 'alert'
      ? 'M 216 101 C 233 84, 247 61, 259 32 L 274 34 C 261 64, 251 88, 244 111 Z'
      : 'M 216 101 C 232 84, 246 64, 257 41 L 272 42 C 260 69, 251 89, 243 112 Z'

  const headPath =
    frame === 'alert'
      ? 'M 251 25 C 259 16, 276 14, 289 20 C 298 24, 302 31, 299 39 C 294 48, 279 51, 265 47 C 255 43, 249 35, 251 25 Z'
      : 'M 249 36 C 258 25, 275 22, 288 27 C 297 31, 301 38, 298 46 C 293 54, 279 57, 266 53 C 255 49, 248 43, 249 36 Z'

  const muzzlePath = frame === 'alert'
    ? 'M 287 25 L 308 28 L 307 36 L 287 37 Z'
    : 'M 286 33 L 307 36 L 305 43 L 286 44 Z'

  const earOne = frame === 'alert'
    ? 'M 261 19 L 254 2 L 264 13 Z'
    : 'M 260 30 L 254 14 L 264 24 Z'
  const earTwo = frame === 'alert'
    ? 'M 268 18 L 271 1 L 275 15 Z'
    : 'M 267 29 L 271 13 L 275 26 Z'

  const antlers = frame === 'alert'
    ? `
      <path d="M 262 10 C 257 -8, 246 -24, 232 -33 C 216 -43, 198 -43, 185 -38" />
      <path d="M 264 10 C 259 -8, 249 -25, 236 -35 C 223 -44, 208 -47, 196 -46" />
      <path d="M 249 -13 L 249 -28" />
      <path d="M 239 -23 L 235 -39" />
      <path d="M 227 -31 L 221 -47" />
      <path d="M 213 -36 L 205 -49" />
      <path d="M 199 -39 L 189 -48" />
      <path d="M 252 -7 L 260 -24" />
      <path d="M 242 -19 L 247 -34" />
      <path d="M 231 -28 L 233 -44" />
      <path d="M 218 -35 L 217 -49" />
      <path d="M 205 -39 L 202 -50" />
    `
    : `
      <path d="M 261 19 C 256 1, 245 -16, 231 -26 C 216 -36, 200 -37, 187 -34" />
      <path d="M 264 19 C 260 2, 250 -15, 238 -27 C 225 -37, 210 -40, 198 -39" />
      <path d="M 249 -3 L 249 -18" />
      <path d="M 239 -14 L 235 -29" />
      <path d="M 227 -22 L 221 -36" />
      <path d="M 214 -28 L 206 -40" />
      <path d="M 201 -31 L 191 -39" />
      <path d="M 252 2 L 259 -13" />
      <path d="M 242 -8 L 247 -22" />
      <path d="M 231 -18 L 233 -32" />
      <path d="M 218 -25 L 217 -37" />
      <path d="M 206 -29 L 203 -39" />
    `

  const legShapes = frame === 'idle' ? idleLegs : frame === 'alert' ? alertLegs : walkLegs[frame]

  const bodyRim =
    frame === 'alert'
      ? 'M 49 118 C 62 89, 112 73, 176 77 C 206 79, 232 89, 249 103'
      : 'M 50 119 C 63 90, 112 74, 176 78 C 206 81, 231 90, 247 103'

  const eye = frame === 'alert' ? '<circle cx="276" cy="27" r="1.4" fill="rgba(164,176,186,0.55)" />' : ''

  return `
  <svg xmlns="http://www.w3.org/2000/svg" width="${SPRITE_WIDTH}" height="${SPRITE_HEIGHT}" viewBox="0 -60 320 280">
    <g>
      <g fill="rgba(14,17,20,0.98)">
        ${legShapes.map((path) => `<path d="${path}"/>`).join('')}
        <path d="M 47 118 C 57 90, 117 72, 182 79 C 214 82, 241 94, 256 109 C 266 118, 266 130, 259 139 C 243 150, 217 157, 172 160 C 121 163, 84 158, 56 147 C 44 141, 40 129, 47 118 Z"/>
        <path d="M 174 86 C 194 84, 212 89, 223 99 C 229 108, 228 120, 220 134 C 208 139, 193 142, 176 142 C 167 129, 165 114, 174 86 Z" fill="rgba(10,13,16,0.99)"/>
        <path d="M 44 119 C 32 121, 24 127, 20 134 C 28 140, 40 141, 53 139 Z" fill="rgba(15,18,21,0.95)"/>
        <path d="${neckPath}"/>
        <path d="${headPath}"/>
        <path d="${muzzlePath}" fill="rgba(9,11,13,0.99)"/>
        <path d="${earOne}" fill="rgba(17,20,24,0.95)"/>
        <path d="${earTwo}" fill="rgba(17,20,24,0.95)"/>
      </g>
      <g stroke="rgba(52,58,64,0.9)" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" fill="none">
        ${antlers}
      </g>
      <path d="${bodyRim}" fill="none" stroke="rgba(145,160,170,0.18)" stroke-width="1.6" stroke-linecap="round"/>
      ${eye}
    </g>
  </svg>`
}

function loadSprites(): Promise<SpriteSet> {
  const keys: SpriteKey[] = ['walk1', 'walk2', 'walk3', 'walk4', 'idle', 'alert']
  const entries = keys.map((key) => new Promise<[SpriteKey, HTMLImageElement]>((resolve) => {
    const img = new Image()
    img.onload = () => resolve([key, img])
    img.src = svgDataUri(buildStagSvg(key))
  }))

  return Promise.all(entries).then((loaded) => {
    const map = Object.fromEntries(loaded) as SpriteSet
    return map
  })
}

function pickFrame(elapsed: number, walkStrength: number, headLift: number, listen: number): SpriteKey {
  if (walkStrength > 0.1) {
    const cycle = ['walk1', 'walk2', 'walk3', 'walk4'] as const
    const step = Math.floor((elapsed * 0.0054) % cycle.length)
    return cycle[step]
  }
  if (listen > 0.25 || headLift > 0.22) return 'alert'
  return 'idle'
}

function drawSpriteStag(
  ctx: CanvasRenderingContext2D,
  sprites: SpriteSet,
  x: number,
  footY: number,
  scale: number,
  direction: 1 | -1,
  frame: SpriteKey,
  bodyBob: number,
  bodyPitch: number,
  listen: number,
) {
  const image = sprites[frame]
  if (!image) return

  ctx.save()
  ctx.translate(x, footY)
  ctx.scale(direction * scale, scale)
  ctx.rotate(direction * bodyPitch)
  ctx.translate(0, bodyBob)
  ctx.drawImage(image, -SPRITE_ANCHOR_X, -SPRITE_ANCHOR_Y, SPRITE_WIDTH, SPRITE_HEIGHT)

  // A tiny moon-side rim helps the silhouette stay legible while remaining dark.
  ctx.beginPath()
  ctx.moveTo(-108, -63)
  ctx.quadraticCurveTo(-52, -103, 34, -93)
  ctx.quadraticCurveTo(71, -88, 95, -73)
  ctx.strokeStyle = `rgba(154, 166, 174, ${0.034 + listen * 0.016})`
  ctx.lineWidth = 0.9
  ctx.stroke()
  ctx.restore()
}

export function StagEncounterLayer({ triggerId }: { triggerId: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const triggerRef = useRef(triggerId)
  const spritesRef = useRef<SpriteSet | null>(null)

  useEffect(() => {
    triggerRef.current = triggerId
  }, [triggerId])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let width = window.innerWidth
    let height = window.innerHeight
    let dpr = Math.min(window.devicePixelRatio || 1, 1.5)
    let raf = 0
    let disposed = false
    let lastTrigger = triggerRef.current
    let encounter: Encounter | null = null

    loadSprites().then((sprites) => {
      if (!disposed) spritesRef.current = sprites
    })

    const resize = () => {
      width = window.innerWidth
      height = window.innerHeight
      dpr = Math.min(window.devicePixelRatio || 1, 1.5)
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ensureWorld(width, height)
    }

    const beginEncounter = (time: number, id: number) => {
      const direction: 1 | -1 = id % 2 === 0 ? -1 : 1
      const scale = Math.max(0.68, Math.min(0.92, width / 1650))
      const margin = 180 * scale
      const pauseX = width * (direction > 0 ? 0.43 : 0.57)
      encounter = {
        startedAt: time,
        direction,
        pauseX,
        startX: direction > 0 ? -margin : width + margin,
        endX: direction > 0 ? width + margin : -margin,
        scale,
        seed: 17.3 + id * 11.71 + seededFrac(id * 9.8) * 10,
      }
    }

    const draw = (time: number) => {
      const requested = triggerRef.current
      if (requested !== lastTrigger) {
        lastTrigger = requested
        if (requested > 0) beginEncounter(time, requested)
      }

      ctx.clearRect(0, 0, width, height)

      const sprites = spritesRef.current
      if (encounter && sprites) {
        const elapsed = time - encounter.startedAt
        const enterEnd = 8_600
        const settleEnd = 11_000
        const listenEnd = 22_200
        const total = 34_500

        if (elapsed >= total) {
          encounter = null
        } else {
          let x = encounter.pauseX
          let walkStrength = 0
          let headLift = 0
          let listen = 0

          if (elapsed < enterEnd) {
            const p = smoothStep(elapsed / enterEnd)
            x = encounter.startX + (encounter.pauseX - encounter.startX) * p
            walkStrength = 0.95
          } else if (elapsed < settleEnd) {
            const p = smoothStep((elapsed - enterEnd) / (settleEnd - enterEnd))
            const overshoot = encounter.direction * 8 * encounter.scale
            x = encounter.pauseX + overshoot * Math.sin(p * Math.PI) * (1 - p)
            walkStrength = 0.95 * (1 - p)
            listen = p * 0.45
          } else if (elapsed < listenEnd) {
            const p = (elapsed - settleEnd) / (listenEnd - settleEnd)
            listen = Math.sin(Math.min(1, p / 0.18) * Math.PI * 0.5) * Math.sin(Math.min(1, (1 - p) / 0.12) * Math.PI * 0.5)
            headLift = smoothStep(clamp01((p - 0.10) / 0.30)) * (1 - smoothStep(clamp01((p - 0.84) / 0.10)))
          } else {
            const p = smoothStep((elapsed - listenEnd) / (total - listenEnd))
            x = encounter.pauseX + (encounter.endX - encounter.pauseX) * p
            walkStrength = 0.95 * smoothStep(clamp01(p / 0.18))
            headLift = Math.max(0, 1 - p * 4) * 0.2
          }

          const sample = 32 * encounter.scale
          const surface = surfaceYAt(x, width, height) - 0.5
          const left = surfaceYAt(x - sample, width, height)
          const right = surfaceYAt(x + sample, width, height)
          const slope = (right - left) / Math.max(1, sample * 2)
          const breath = Math.sin(time * 0.0011 + encounter.seed) * (0.18 + listen * 0.10)
          const bodyBob = breath + (walkStrength > 0.1 ? Math.sin(elapsed * 0.0108) * 0.55 * walkStrength : 0)
          const bodyPitch = Math.max(-0.045, Math.min(0.045, slope * 0.22))
          const frame = pickFrame(elapsed, walkStrength, headLift, listen)

          drawSpriteStag(
            ctx,
            sprites,
            x,
            surface,
            encounter.scale,
            encounter.direction,
            frame === 'alert' && headLift < 0.18 ? 'idle' : frame,
            bodyBob,
            bodyPitch - headLift * 0.01,
            listen,
          )
        }
      }

      raf = requestAnimationFrame(draw)
    }

    resize()
    window.addEventListener('resize', resize)
    raf = requestAnimationFrame(draw)

    return () => {
      disposed = true
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
    }
  }, [])

  return <canvas className="scene-canvas stag-encounter-canvas" ref={canvasRef} aria-hidden="true" />
}
