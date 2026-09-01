import { useEffect, useRef, type CSSProperties } from 'react'
import type { AliveSkyEvent } from './useAliveWorld'
import { surfaceYAt } from '../world/worldState'

type AliveSkyEventsProps = {
  event: AliveSkyEvent | null
}

function seeded(seed: number) {
  const n = Math.sin(seed * 12.9898 + 78.233) * 43758.5453
  return n - Math.floor(n)
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value))
}

function smoothStep(value: number) {
  const t = clamp01(value)
  return t * t * (3 - 2 * t)
}

function veilHash2D(ix: number, iy: number, seed: number) {
  const n = Math.sin(ix * 127.1 + iy * 311.7 + seed * 74.7) * 43758.5453123
  return n - Math.floor(n)
}

function veilNoise2D(x: number, y: number, seed: number) {
  const ix = Math.floor(x)
  const iy = Math.floor(y)
  const fx = smoothStep(x - ix)
  const fy = smoothStep(y - iy)
  const v00 = veilHash2D(ix, iy, seed)
  const v10 = veilHash2D(ix + 1, iy, seed)
  const v01 = veilHash2D(ix, iy + 1, seed)
  const v11 = veilHash2D(ix + 1, iy + 1, seed)
  const a = v00 + (v10 - v00) * fx
  const b = v01 + (v11 - v01) * fx
  return a + (b - a) * fy
}

function veilFbm(x: number, y: number, seed: number) {
  let value = 0
  let amplitude = 0.58
  let frequency = 1
  let normalizer = 0
  for (let octave = 0; octave < 4; octave++) {
    value += (veilNoise2D(x * frequency, y * frequency, seed + octave * 19.3) * 2 - 1) * amplitude
    normalizer += amplitude
    amplitude *= 0.52
    frequency *= 2.03
  }
  return value / normalizer
}

function MoonVeilCloud({ eventId }: { eventId: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d', { alpha: true })
    if (!ctx) return

    const width = 220
    const height = 82
    canvas.width = width
    canvas.height = height
    const image = ctx.createImageData(width, height)
    const data = image.data
    const seed = 317.4 + eventId * 13.7

    for (let y = 0; y < height; y++) {
      const ny = y / (height - 1)
      for (let x = 0; x < width; x++) {
        const nx = x / (width - 1)
        const warp = veilFbm(nx * 1.35 + 2.1, ny * 1.2 + 4.7, seed + 11.6) * 0.10
        const center = 0.50
          + veilFbm(nx * 1.2 + 5.4, 1.9, seed + 28.2) * 0.075
          + veilFbm(nx * 3.2 + 1.2, 5.8, seed + 39.5) * 0.025
        const thickness = 0.24 + veilFbm(nx * 1.55 + 7.1, 3.3, seed + 53.8) * 0.045
        const vertical = 1 - smoothStep((Math.abs(ny - center) - thickness * 0.25) / Math.max(0.05, thickness * 0.92))
        const broad = veilFbm((nx + warp) * 1.75 + 1.8, ny * 1.25 + 2.4, seed + 71.4)
        const medium = veilFbm((nx - warp * 0.45) * 4.1 + 6.2, ny * 3.1 + 1.6, seed + 92.7)
        const ends = smoothStep(nx / 0.10) * (1 - smoothStep((nx - 0.88) / 0.12))
        const density = clamp01((broad * 0.64 + medium * 0.24 + 0.50) * 1.22) * vertical * ends
        const wisps = clamp01((medium + 0.26) * 1.25) * vertical * ends * 0.12
        const alpha = clamp01(Math.pow(density, 1.18) + wisps)

        const i = (y * width + x) * 4
        data[i] = 3
        data[i + 1] = 5
        data[i + 2] = 7
        data[i + 3] = Math.round(alpha * 226)
      }
    }

    ctx.putImageData(image, 0, 0)
  }, [eventId])

  return <canvas ref={canvasRef} className="alive-veil-cloud-field" aria-hidden="true" />
}

function tailAngle(travelX: number, travelY: number) {
  // travelX is in vw and travelY is in vh, so convert both into approximate
  // screen pixels before calculating the trajectory angle. The sign keeps a
  // left-moving meteor's tail above/right of the head instead of below it.
  const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 1600
  const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 900
  const direction = travelX < 0 ? -1 : 1
  const angle = Math.atan2(
    Math.abs(travelY) * viewportHeight,
    Math.abs(travelX) * viewportWidth,
  ) * (180 / Math.PI)

  return direction * angle
}


function liveSkyClipPath() {
  if (typeof window === 'undefined') return undefined
  const width = Math.max(1, window.innerWidth)
  const height = Math.max(1, window.innerHeight)
  const samples = 32
  const points = ['0% 0%', '100% 0%']

  // Trace the *live* world surface from right to left. surfaceYAt includes
  // permanent terrain, standing water and snow, so routine meteors obey the
  // same physical occlusion rule as the Great Meteor canvas.
  for (let index = samples; index >= 0; index--) {
    const x = (index / samples) * width
    const y = Math.max(0, Math.min(height, surfaceYAt(x, width, height)))
    points.push(`${(index / samples) * 100}% ${(y / height) * 100}%`)
  }

  return `polygon(${points.join(', ')})`
}

export function AliveSkyEvents({ event }: AliveSkyEventsProps) {
  if (!event || event.kind === 'meteor-impact' || event.kind === 'depth-flash') return null

  if (event.kind === 'distant-flash') {
    return (
      <div
        key={event.id}
        className="alive-distant-flash"
        style={{ '--alive-event-duration': `${event.duration ?? 1500}ms` } as CSSProperties}
        aria-hidden="true"
      />
    )
  }

  if (event.kind === 'moon-veil') {
    return (
      <div
        key={event.id}
        className="alive-moon-veil"
        style={{ '--alive-event-duration': `${event.duration ?? 26000}ms` } as CSSProperties}
        aria-hidden="true"
      >
        <MoonVeilCloud eventId={event.id} />
      </div>
    )
  }

  if (event.kind === 'meteor-shower') {
    const count = Math.max(3, Math.min(8, event.count ?? 5))
    const direction = event.direction ?? 1
    const duration = event.duration ?? 4200

    return (
      <div key={event.id} className="alive-meteor-shower" style={{ clipPath: liveSkyClipPath() }} aria-hidden="true">
        {Array.from({ length: count }, (_, index) => {
          const a = seeded(event.id * 31 + index * 7.3)
          const b = seeded(event.id * 53 + index * 11.7)
          const c = seeded(event.id * 79 + index * 13.1)
          const startX = direction > 0 ? 6 + a * 50 : 94 - a * 50
          const startY = 5 + b * 30
          const travelX = direction * (38 + c * 46)
          const travelY = 26 + a * 62
          const delay = index * (390 + b * 520)
          const starDuration = 1750 + c * 1250

          return (
            <i
              key={index}
              className="alive-meteor-shower-star"
              style={{
                '--alive-star-x': `${startX}vw`,
                '--alive-star-y': `${startY}vh`,
                '--alive-star-dx': `${travelX}vw`,
                '--alive-star-dy': `${travelY}vh`,
                '--alive-star-dir': `${direction}`,
                '--alive-tail-angle': `${tailAngle(travelX, travelY)}deg`,
                '--alive-star-delay': `${delay}ms`,
                '--alive-star-duration': `${Math.min(starDuration, duration)}ms`,
              } as CSSProperties}
            />
          )
        })}
      </div>
    )
  }

  return (
    <div
      key={event.id}
      className="alive-meteor-sky-clip"
      style={{ clipPath: liveSkyClipPath() }}
      aria-hidden="true"
    >
      <i
        className="alive-shooting-star"
        style={{
          '--alive-star-x': `${event.startX ?? 30}vw`,
          '--alive-star-y': `${event.startY ?? 18}vh`,
          '--alive-star-dx': `${event.travelX ?? 58}vw`,
          '--alive-star-dy': `${event.travelY ?? 46}vh`,
          '--alive-event-duration': `${event.duration ?? 1200}ms`,
          '--alive-star-dir': `${event.direction ?? 1}`,
          '--alive-tail-angle': `${tailAngle(event.travelX ?? 58, event.travelY ?? 46)}deg`,
        } as CSSProperties}
      />
    </div>
  )
}