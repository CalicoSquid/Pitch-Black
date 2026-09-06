import { useEffect, useRef, type CSSProperties } from 'react'
import type { SunriseLifecycle } from './sunriseLogic'
import { drawDistantDepth, distantRidgeY } from '../world/distantLandscape'
import { canvasPixelRatio } from '../rendering/canvasBudget'

export function SunriseLayer({ level, progress, lifecycle }: {
  level: number; progress: number; lifecycle: SunriseLifecycle | 'preview'
}) {
  // Keep the canvas alive through the CSS exit so removing it never cuts a fade short.
  const active = level > 0.0005
  const visible = useRef(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const hostRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const host = hostRef.current
    const canvas = canvasRef.current
    if (!host || !canvas) return
    let cleanupTimer = 0
    const draw = () => {
      const width = window.innerWidth, height = window.innerHeight
      const ratio = canvasPixelRatio(width, height, 1.5)
      canvas.width = Math.round(width * ratio)
      canvas.height = Math.round(height * ratio)
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
      drawDistantDepth(ctx, width, height, 1, true)
      host.style.setProperty('--sunrise-ridge', `${distantRidgeY(width * 0.58, width, height, 'far')}px`)
    }
    if (active) {
      visible.current = true
      draw()
      window.addEventListener('resize', draw)
    } else if (visible.current) {
      cleanupTimer = window.setTimeout(() => { canvas.width = 1; canvas.height = 1; visible.current = false }, 1800)
    }
    return () => { window.clearTimeout(cleanupTimer); window.removeEventListener('resize', draw) }
  }, [active, canvasRef, visible])
  return <div ref={hostRef} className={`sunrise-layer sunrise-${lifecycle}`} style={{
    '--sunrise-level': Math.min(1, Math.max(0, level)),
    '--sunrise-rise': `${Math.max(0, progress - 0.2) * 15}vh`,
  } as CSSProperties} aria-hidden="true">
    <div className="sunrise-dawn-sky" />
    <div className="sunrise-sun" />
    <canvas ref={canvasRef} className="sunrise-landscape" width="1" height="1" />
  </div>
}
