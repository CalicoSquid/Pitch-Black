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
    // Pointer Events are the main path, but embedded TV/projector browsers and
    // remotes often expose only legacy mouse/click or focus events. Treat all
    // of them as equivalent activity without changing the hide timing.
    const events: (keyof WindowEventMap)[] = [
      'pointermove',
      'pointerdown',
      'mousemove',
      'mousedown',
      'click',
      'touchstart',
      'keydown',
      'wheel',
      'focus',
    ]
    events.forEach((event) => window.addEventListener(event, wake, { passive: true }))
    document.addEventListener('focusin', wake, { passive: true })
    return () => {
      events.forEach((event) => window.removeEventListener(event, wake))
      document.removeEventListener('focusin', wake)
      if (timer.current !== null) window.clearTimeout(timer.current)
      timer.current = null
    }
  }, [wake])

  return visible
}
