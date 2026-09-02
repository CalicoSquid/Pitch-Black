function buildMoonLitPath(phase: number) {
  const cx = 100
  const cy = 100
  const radius = 96
  const waxing = phase <= 0.5
  const alpha = waxing ? phase * Math.PI * 2 : (1 - phase) * Math.PI * 2
  const samples = 64
  const left: Array<[number, number]> = []
  const right: Array<[number, number]> = []

  for (let i = 0; i <= samples; i++) {
    const yNorm = -1 + (i / samples) * 2
    const halfWidth = Math.sqrt(Math.max(0, 1 - yNorm * yNorm)) * radius
    const y = cy + yNorm * radius

    if (waxing) {
      left.push([cx + halfWidth * Math.cos(alpha), y])
      right.push([cx + halfWidth, y])
    } else {
      left.push([cx - halfWidth, y])
      right.push([cx - halfWidth * Math.cos(alpha), y])
    }
  }

  const points = [...left, ...right.reverse()]
  if (points.length === 0) return ''
  return `M ${points[0][0].toFixed(2)} ${points[0][1].toFixed(2)} ` +
    points.slice(1).map(([x, y]) => `L ${x.toFixed(2)} ${y.toFixed(2)}`).join(' ') +
    ' Z'
}

export function GlobalMoon({ visible, halo = false }: { visible: boolean; halo?: boolean }) {
  const now = new Date()
  const synodic = 29.53058867
  const knownNewMoon = Date.UTC(2000, 0, 6, 18, 14)
  const days = (now.getTime() - knownNewMoon) / 86400000
  const phase = ((days % synodic) + synodic) % synodic / synodic
  const illumination = (1 - Math.cos(phase * Math.PI * 2)) / 2
  const litPath = buildMoonLitPath(phase)

  const opacity = visible ? 0.94 : 0

  return (
    <div
      className={`global-moon ${halo && visible ? 'moon-halo' : ''}`}
      style={{ opacity }}
      aria-hidden={!visible}
      aria-label={visible ? `Moon, ${Math.round(illumination * 100)} percent illuminated` : undefined}
    >
      <svg
        className="global-moon-svg"
        viewBox="0 0 200 200"
        role="img"
        aria-hidden="true"
      >
        <defs>
          <clipPath id="moon-disc-clip">
            <circle cx="100" cy="100" r="96" />
          </clipPath>
          <clipPath id="moon-lit-clip">
            <path d={litPath} />
          </clipPath>
        </defs>

        {/* The physical lunar disc occludes the star field even on the unlit side.
            Without this matte, stars behind the SVG read as if they are painted
            on top of the moon during crescent / quarter phases. */}
        <circle cx="100" cy="100" r="96" fill="rgba(0, 0, 0, 0.992)" />

        {/* Faint earthshine keeps the lunar body readable without faking the phase. */}
        <g clipPath="url(#moon-disc-clip)" opacity="0.075">
          <image href="/moon-texture.png" x="4" y="4" width="192" height="192" preserveAspectRatio="xMidYMid slice" />
          <image href="https://assets.science.nasa.gov/dynamicimage/assets/science/missions/hubble/releases/1999/04/STScI-01EVTA4B0CT67AJW6WYMQRF0MY.tif?crop=faces%2Cfocalpoint&fit=clip&h=1200&w=1200" x="4" y="4" width="192" height="192" preserveAspectRatio="xMidYMid slice" />
        </g>

        {/* The real illuminated portion: curved crescent / quarter / gibbous geometry. */}
        <g clipPath="url(#moon-lit-clip)">
          <image href="/moon-texture.png" x="4" y="4" width="192" height="192" preserveAspectRatio="xMidYMid slice" />
          <image href="https://assets.science.nasa.gov/dynamicimage/assets/science/missions/hubble/releases/1999/04/STScI-01EVTA4B0CT67AJW6WYMQRF0MY.tif?crop=faces%2Cfocalpoint&fit=clip&h=1200&w=1200" x="4" y="4" width="192" height="192" preserveAspectRatio="xMidYMid slice" />
        </g>

        <circle cx="100" cy="100" r="96" fill="none" stroke="rgba(220,228,234,0.08)" strokeWidth="0.8" />
      </svg>
    </div>
  )
}

