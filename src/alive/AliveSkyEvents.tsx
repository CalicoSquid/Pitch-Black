import type { CSSProperties } from 'react'
import type { AliveSkyEvent } from './useAliveWorld'

type AliveSkyEventsProps = {
  event: AliveSkyEvent | null
}

function seeded(seed: number) {
  const n = Math.sin(seed * 12.9898 + 78.233) * 43758.5453
  return n - Math.floor(n)
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

export function AliveSkyEvents({ event }: AliveSkyEventsProps) {
  if (!event || event.kind === 'meteor-impact') return null

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
        <i className="alive-veil-cloud c1" />
        <i className="alive-veil-cloud c2" />
        <i className="alive-veil-cloud c3" />
        <i className="alive-veil-cloud c4" />
        <i className="alive-veil-cloud c5" />
      </div>
    )
  }

  if (event.kind === 'meteor-shower') {
    const count = Math.max(3, Math.min(8, event.count ?? 5))
    const direction = event.direction ?? 1
    const duration = event.duration ?? 4200

    return (
      <div key={event.id} className="alive-meteor-shower" aria-hidden="true">
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
      aria-hidden="true"
    />
  )
}
