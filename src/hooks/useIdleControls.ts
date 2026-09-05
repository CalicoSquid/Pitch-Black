import { useCallback, useEffect, useRef, useState } from 'react'

export function useIdleControls(delay = 3200) {
  const [visible, setVisible] = useState(true)
  const timer = useRef<number | null>(null)

  const wake = useCallback(() => {
    setVisible(true)
    if (timer.current !== null) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      timer.current = null
      setVisible(false)
    }, delay)
  }, [delay])

  useEffect(() => {
    wake()
    // Every real interaction restarts one simple hide timer. Keeping focus on a
    // control must not pin the dock open; the user never needs to tap elsewhere.
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
