import { useMemo } from 'react'
import type { CSSProperties } from 'react'
import type { AlivePhase } from './useAliveWorld'

type AliveNightSkyProps = {
  phase: AlivePhase
}

function seeded(seed: number) {
  const n = Math.sin(seed * 12.9898 + 78.233) * 43758.5453
  return n - Math.floor(n)
}

export function AliveNightSky({ phase }: AliveNightSkyProps) {
  const stars = useMemo(() => {
    return Array.from({ length: 56 }, (_, index) => {
      const x = 2 + seeded(index * 5.17 + 1) * 96
      const y = 2 + seeded(index * 8.91 + 3) * 73
      const sizeRoll = seeded(index * 13.31 + 9)
      const size = sizeRoll > 0.93 ? 1.75 : sizeRoll > 0.72 ? 1.2 : 0.82
      const opacity = 0.16 + seeded(index * 17.77 + 2) * 0.38
      const duration = 5.5 + seeded(index * 23.41 + 5) * 8.5
      const delay = -(seeded(index * 29.13 + 8) * duration)

      return { x, y, size, opacity, duration, delay }
    })
  }, [])

  return (
    <div className="alive-night-sky" data-phase={phase} aria-hidden="true">
      {stars.map((star, index) => (
        <i
          key={index}
          style={{
            '--alive-star-left': `${star.x}%`,
            '--alive-star-top': `${star.y}%`,
            '--alive-star-size': `${star.size}px`,
            '--alive-star-opacity': `${star.opacity}`,
            '--alive-star-twinkle': `${star.duration}s`,
            '--alive-star-delay': `${star.delay}s`,
          } as CSSProperties}
        />
      ))}
    </div>
  )
}
