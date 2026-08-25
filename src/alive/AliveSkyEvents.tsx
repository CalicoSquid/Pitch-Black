import type { CSSProperties } from 'react'
import type { AliveSkyEvent } from './useAliveWorld'

type AliveSkyEventsProps = {
  event: AliveSkyEvent | null
}

export function AliveSkyEvents({ event }: AliveSkyEventsProps) {
  if (!event) return null

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

  return (
    <div
      key={event.id}
      className="alive-shooting-star"
      style={{
        '--alive-star-x': `${event.startX ?? 30}vw`,
        '--alive-star-y': `${event.startY ?? 18}vh`,
        '--alive-star-dx': `${event.travelX ?? 170}px`,
        '--alive-star-dy': `${event.travelY ?? 62}px`,
        '--alive-event-duration': `${event.duration ?? 1200}ms`,
        '--alive-star-dir': `${event.direction ?? 1}`,
      } as CSSProperties}
      aria-hidden="true"
    />
  )
}
