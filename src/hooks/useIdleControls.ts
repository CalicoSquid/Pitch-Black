import { useCallback, useEffect, useRef, useState } from 'react'

export function useIdleControls(delay = 3200) {
  const [visible, setVisible] = useState(true)
  const timer = useRef<number | null>(null)
  const lastActivity = useRef(0)

  const scheduleHide = useCallback(() => {
    if (timer.current !== null) return

    const check = () => {
      const remaining = delay - (performance.now() - lastActivity.current)
      if (remaining <= 0) {
        timer.current = null
        setVisible(false)
        return
      }
      timer.current = window.setTimeout(check, remaining)
    }

    timer.current = window.setTimeout(check, delay)
  }, [delay])

  const wake = useCallback(() => {
    lastActivity.current = performance.now()
    setVisible(true)
    scheduleHide()
  }, [scheduleHide])

  useEffect(() => {
    wake()
    const events: (keyof WindowEventMap)[] = ['pointermove', 'pointerdown', 'keydown']
    events.forEach((event) => window.addEventListener(event, wake, { passive: true }))
    return () => {
      events.forEach((event) => window.removeEventListener(event, wake))
      if (timer.current !== null) window.clearTimeout(timer.current)
      timer.current = null
    }
  }, [wake])

  return visible
}
