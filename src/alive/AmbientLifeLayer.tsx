import { useEffect, type CSSProperties } from 'react'
import type { AmbientLifeEvent, AmbientLifeEventKind } from './useAliveWorld'

type AmbientLifeLayerProps = {
  event: AmbientLifeEvent
  soundOn: boolean
  onComplete?: (kind: AmbientLifeEventKind, id: number) => void
}

function Airplane({ event }: { event: AmbientLifeEvent }) {
  const direction = event.direction ?? 1
  const duration = event.duration ?? 190_000
  const startY = event.startY ?? 14
  const travelY = event.travelY ?? 4
  const startScale = event.startScale ?? 0.78
  const endScale = event.endScale ?? 1.02

  return (
    <div
      className={`ambient-airplane ${direction < 0 ? 'from-right' : 'from-left'}`}
      style={{
        '--life-plane-y': `${startY}vh`,
        '--life-plane-dy': `${travelY}vh`,
        '--life-plane-duration': `${duration}ms`,
        '--life-plane-scale-start': `${startScale}`,
        '--life-plane-scale-end': `${endScale}`,
      } as CSSProperties}
      aria-hidden="true"
    >
      <i className="ambient-airplane-red" />
      <i className="ambient-airplane-green" />
      <i className="ambient-airplane-strobe" />
    </div>
  )
}

export function AmbientLifeLayer({ event, onComplete }: AmbientLifeLayerProps) {
  useEffect(() => {
    const duration = event.duration ?? 190_000
    const timer = window.setTimeout(() => onComplete?.(event.kind, event.id), duration + 250)
    return () => window.clearTimeout(timer)
  }, [event, onComplete])

  return <Airplane event={event} />
}
