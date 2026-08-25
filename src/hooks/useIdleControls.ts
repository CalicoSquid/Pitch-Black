import { useCallback, useEffect, useRef, useState } from 'react'

export function useIdleControls(delay = 3200) {
  const [visible, setVisible] = useState(true)
  const timer = useRef<number | null>(null)

  const wake = useCallback(() => {
    setVisible(true)
    if (timer.current) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setVisible(false), delay)
  }, [delay])

  useEffect(() => {
    wake()
    const events: (keyof WindowEventMap)[] = ['pointermove', 'pointerdown', 'keydown']
    events.forEach((event) => window.addEventListener(event, wake, { passive: true }))
    return () => {
      events.forEach((event) => window.removeEventListener(event, wake))
      if (timer.current) window.clearTimeout(timer.current)
    }
  }, [wake])

  return visible
}

