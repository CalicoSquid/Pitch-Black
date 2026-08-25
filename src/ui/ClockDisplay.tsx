import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'

type ClockDisplayProps = {
  awake: boolean
}

const timeFormatter = new Intl.DateTimeFormat(undefined, {
  hour: '2-digit',
  minute: '2-digit',
})

const weekdayFormatter = new Intl.DateTimeFormat(undefined, {
  weekday: 'long',
})

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'long',
})

export function ClockDisplay({ awake }: ClockDisplayProps) {
  const [now, setNow] = useState(new Date())
  const [driftStep, setDriftStep] = useState(() => Math.floor(Date.now() / 300_000))

  const drift = useMemo(() => {
    const positions = [
      [0, 0], [2, -1], [-2, 1], [1, 2], [-1, -2], [3, 0], [-3, 1], [1, -3],
    ] as const
    return positions[Math.abs(driftStep) % positions.length]
  }, [driftStep])

  useEffect(() => {
    let timer = 0

    const tick = () => {
      const next = new Date()
      setNow(next)
      setDriftStep(Math.floor(next.getTime() / 300_000))

      const delay = 60_000 - (next.getTime() % 60_000) + 20
      timer = window.setTimeout(tick, delay)
    }

    const initialDelay = 60_000 - (Date.now() % 60_000) + 20
    timer = window.setTimeout(tick, initialDelay)

    const refreshAfterSleep = () => {
      if (document.visibilityState !== 'visible') return
      window.clearTimeout(timer)
      tick()
    }

    document.addEventListener('visibilitychange', refreshAfterSleep)
    return () => {
      window.clearTimeout(timer)
      document.removeEventListener('visibilitychange', refreshAfterSleep)
    }
  }, [])

  return (
    <div
      className={`sleep-clock ${awake ? 'clock-awake' : 'clock-asleep'}`}
      role="timer"
      aria-live="off"
      style={{ '--clock-drift-x': `${drift[0]}px`, '--clock-drift-y': `${drift[1]}px` } as CSSProperties}
    >
      <div className="sleep-clock-time">{timeFormatter.format(now)}</div>
      <div className="sleep-clock-date" aria-hidden={!awake}>
        <span>{weekdayFormatter.format(now)}</span>
        <span className="sleep-clock-separator" aria-hidden="true">·</span>
        <span>{dateFormatter.format(now)}</span>
      </div>
    </div>
  )
}
