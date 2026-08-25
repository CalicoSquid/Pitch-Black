import { useEffect, useRef } from 'react'
import { fireflySignal } from '../world/fireflySignal'
import { pitchWorld, snowSurfaceYAtIndex, worldIndexAt } from '../world/worldState'

type Firefly = {
  id: number
  x: number
  y: number
  vx: number
  vy: number
  heading: number
  desiredHeading: number
  speed: number
  targetSpeed: number
  nextTurn: number
  turnPhase: number
  turnRate: number
  blinkStart: number
  blinkDuration: number
  blinkPeak: number
  nextBlink: number
  doubleBlink: boolean
  shimmerPhase: number
  size: number
  leaveAt: number
  exiting: boolean
  exitAt: number
  exitEdge: number
  exitTarget: number
  dying: boolean
  deathStart: number
  deathDuration: number
}

const TAU = Math.PI * 2

function wrapAngle(angle: number) {
  while (angle > Math.PI) angle -= TAU
  while (angle < -Math.PI) angle += TAU
  return angle
}

function populationForWidth(width: number, multiplier = 1) {
  let base = 0
  if (width < 560) base = 8 + Math.floor(Math.random() * 5)
  else if (width < 900) base = 10 + Math.floor(Math.random() * 5)
  else base = 12 + Math.floor(Math.random() * 7)
  return Math.min(54, Math.max(0, Math.round(base * multiplier)))
}

function chooseExitEdge(firefly: Firefly, width: number, height: number) {
  const horizontalBias = Math.abs(firefly.vx) + Math.random() * 5
  const verticalBias = Math.abs(firefly.vy) + Math.random() * 5

  if (horizontalBias >= verticalBias) {
    firefly.exitEdge = firefly.vx < 0 ? 0 : 1
    firefly.exitTarget = Math.max(height * 0.18, Math.min(height * 0.88, firefly.y + (Math.random() - 0.5) * height * 0.18))
  } else {
    firefly.exitEdge = firefly.vy < 0 ? 2 : 3
    firefly.exitTarget = Math.max(width * 0.08, Math.min(width * 0.92, firefly.x + (Math.random() - 0.5) * width * 0.18))
  }
}

export function FirefliesLayer({ active, visible, abundance = 1 }: { active: boolean; visible: boolean; abundance?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const activeRef = useRef(active)
  const visibleRef = useRef(visible)
  const abundanceRef = useRef(abundance)

  useEffect(() => {
    activeRef.current = active
  }, [active])

  useEffect(() => {
    visibleRef.current = visible
  }, [visible])

  useEffect(() => {
    abundanceRef.current = Math.max(0.4, Math.min(3, abundance))
  }, [abundance])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let width = window.innerWidth
    let height = window.innerHeight
    let dpr = Math.min(window.devicePixelRatio || 1, 1.25)
    let raf = 0
    let last = performance.now()
    let wasActive = activeRef.current
    let lastAbundance = abundanceRef.current
    let targetPopulation = wasActive ? populationForWidth(width, lastAbundance) : 0
    let nextSpawn = last + 120
    let recoveryBlockedUntil = 0
    let nextFireflyId = 1
    const fireflies: Firefly[] = []
    let canvasCleared = false

    const resize = () => {
      width = window.innerWidth
      height = window.innerHeight
      dpr = Math.min(window.devicePixelRatio || 1, 1.25)
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

      if (activeRef.current && fireflies.length > targetPopulation + 2) {
        targetPopulation = populationForWidth(width, abundanceRef.current)
      }
    }

    const scheduleBlink = (firefly: Firefly, time: number, soon = false) => {
      firefly.blinkDuration = 520 + Math.random() * 820
      firefly.blinkPeak = 0.72 + Math.random() * 0.28
      firefly.doubleBlink = Math.random() < 0.24
      firefly.blinkStart = -1
      firefly.nextBlink = time + (soon ? 160 + Math.random() * 1500 : 1200 + Math.random() * 5200)
    }

    const spawnFirefly = (time: number) => {
      const edgeRoll = Math.random()
      let x = 0
      let y = 0
      let heading = 0

      if (edgeRoll < 0.39) {
        x = -16 - Math.random() * 12
        y = height * (0.28 + Math.random() * 0.56)
        heading = (Math.random() - 0.5) * 0.8
      } else if (edgeRoll < 0.78) {
        x = width + 16 + Math.random() * 12
        y = height * (0.28 + Math.random() * 0.56)
        heading = Math.PI + (Math.random() - 0.5) * 0.8
      } else if (edgeRoll < 0.92) {
        x = width * (0.12 + Math.random() * 0.76)
        y = height + 16 + Math.random() * 10
        heading = -Math.PI / 2 + (Math.random() - 0.5) * 0.7
      } else {
        x = width * (0.15 + Math.random() * 0.70)
        y = -16 - Math.random() * 10
        heading = Math.PI / 2 + (Math.random() - 0.5) * 0.7
      }

      const speed = 8 + Math.random() * 8
      const firefly: Firefly = {
        id: nextFireflyId++,
        x,
        y,
        vx: Math.cos(heading) * speed,
        vy: Math.sin(heading) * speed,
        heading,
        desiredHeading: heading,
        speed,
        targetSpeed: speed,
        nextTurn: time + 500 + Math.random() * 2200,
        turnPhase: Math.random() * TAU,
        turnRate: 0.00045 + Math.random() * 0.00055,
        blinkStart: -1,
        blinkDuration: 800,
        blinkPeak: 0.7,
        nextBlink: time,
        doubleBlink: false,
        shimmerPhase: Math.random() * TAU,
        size: 1.15 + Math.random() * 0.70,
        leaveAt: time + 34000 + Math.random() * 70000,
        exiting: false,
        exitAt: 0,
        exitEdge: 0,
        exitTarget: 0,
        dying: false,
        deathStart: 0,
        deathDuration: 0,
      }
      scheduleBlink(firefly, time, true)
      fireflies.push(firefly)
    }

    const beginExit = (firefly: Firefly, time: number, delay: number) => {
      if (firefly.exiting) return
      firefly.exiting = true
      firefly.exitAt = time + delay
      chooseExitEdge(firefly, width, height)
    }

    const blinkEnvelope = (firefly: Firefly, time: number) => {
      if (firefly.blinkStart < 0) return 0
      const progress = (time - firefly.blinkStart) / firefly.blinkDuration
      if (progress < 0 || progress >= 1) return 0

      if (!firefly.doubleBlink) {
        const pulse = Math.sin(progress * Math.PI)
        return pulse * pulse
      }

      let first = 0
      let second = 0
      const firstProgress = progress / 0.42
      const secondProgress = (progress - 0.56) / 0.44
      if (firstProgress >= 0 && firstProgress <= 1) {
        const pulse = Math.sin(firstProgress * Math.PI)
        first = pulse * pulse
      }
      if (secondProgress >= 0 && secondProgress <= 1) {
        const pulse = Math.sin(secondProgress * Math.PI)
        second = pulse * pulse * 0.82
      }
      return Math.max(first, second)
    }

    const drawFirefly = (firefly: Firefly, time: number) => {
      if (firefly.dying) {
        const progress = Math.min(1, Math.max(0, (time - firefly.deathStart) / firefly.deathDuration))
        const flashProgress = Math.min(1, progress / 0.34)
        const flash = Math.sin(flashProgress * Math.PI)
        const fade = 1 - progress
        const glow = Math.min(1.15, 0.18 * fade + flash * 1.08)

        ctx.beginPath()
        ctx.arc(firefly.x, firefly.y, (8.4 + firefly.size * 3.3) * (0.82 + flash * 0.26), 0, TAU)
        ctx.fillStyle = `rgba(255, 203, 45, ${glow * 0.065 * fade})`
        ctx.fill()

        ctx.beginPath()
        ctx.arc(firefly.x, firefly.y, 3.0 + firefly.size * 1.2, 0, TAU)
        ctx.fillStyle = `rgba(255, 225, 91, ${glow * 0.24 * fade})`
        ctx.fill()

        ctx.beginPath()
        ctx.arc(firefly.x, firefly.y, 1.0 + firefly.size * 0.48, 0, TAU)
        ctx.fillStyle = `rgba(255, 249, 190, ${(0.10 + glow * 0.88) * fade})`
        ctx.fill()
        return
      }

      const pulse = blinkEnvelope(firefly, time)
      const quiet = 0.045 + (Math.sin(time * 0.0011 + firefly.shimmerPhase) + 1) * 0.018
      const glow = Math.min(1, quiet + pulse * firefly.blinkPeak)

      const outerRadius = (7.6 + firefly.size * 3.0) * (0.72 + pulse * 0.28)
      ctx.beginPath()
      ctx.arc(firefly.x, firefly.y, outerRadius, 0, TAU)
      ctx.fillStyle = `rgba(255, 196, 38, ${glow * 0.045})`
      ctx.fill()

      ctx.beginPath()
      ctx.arc(firefly.x, firefly.y, 2.7 + firefly.size * 1.15, 0, TAU)
      ctx.fillStyle = `rgba(255, 218, 72, ${glow * 0.18})`
      ctx.fill()

      ctx.beginPath()
      ctx.arc(firefly.x, firefly.y, 0.92 + firefly.size * 0.46, 0, TAU)
      ctx.fillStyle = `rgba(255, 246, 166, ${0.08 + glow * 0.84})`
      ctx.fill()
    }

    const updateFirefly = (firefly: Firefly, time: number, dt: number) => {
      if (firefly.dying) {
        const damping = Math.max(0, 1 - dt * 2.4)
        firefly.vx *= damping
        firefly.vy *= damping
        firefly.x += firefly.vx * dt
        firefly.y += firefly.vy * dt
        return
      }

      if (firefly.blinkStart >= 0 && time >= firefly.blinkStart + firefly.blinkDuration) {
        scheduleBlink(firefly, time)
      } else if (firefly.blinkStart < 0 && time >= firefly.nextBlink) {
        firefly.blinkStart = time
      }

      if (!firefly.exiting && time >= firefly.leaveAt) {
        beginExit(firefly, time, 500 + Math.random() * 1800)
      }

      if (time >= firefly.nextTurn && (!firefly.exiting || time < firefly.exitAt)) {
        firefly.desiredHeading += (Math.random() - 0.5) * 1.55
        firefly.targetSpeed = 6.5 + Math.random() * 11.5
        firefly.nextTurn = time + 850 + Math.random() * 3000
      }

      let targetHeading = firefly.desiredHeading + Math.sin(time * firefly.turnRate + firefly.turnPhase) * 0.24
      let targetSpeed = firefly.targetSpeed

      if (firefly.exiting && time >= firefly.exitAt) {
        let targetX = firefly.x
        let targetY = firefly.y
        if (firefly.exitEdge === 0) {
          targetX = -58
          targetY = firefly.exitTarget
        } else if (firefly.exitEdge === 1) {
          targetX = width + 58
          targetY = firefly.exitTarget
        } else if (firefly.exitEdge === 2) {
          targetX = firefly.exitTarget
          targetY = -58
        } else {
          targetX = firefly.exitTarget
          targetY = height + 58
        }
        targetHeading = Math.atan2(targetY - firefly.y, targetX - firefly.x)
        targetSpeed = 13 + firefly.size * 5
      } else {
        const marginX = Math.min(110, width * 0.13)
        const topMargin = height * 0.18
        const bottomMargin = height * 0.88
        let steerX = Math.cos(targetHeading)
        let steerY = Math.sin(targetHeading)

        if (firefly.x < marginX) steerX += (marginX - firefly.x) / marginX * 1.35
        if (firefly.x > width - marginX) steerX -= (firefly.x - (width - marginX)) / marginX * 1.35
        if (firefly.y < topMargin) steerY += (topMargin - firefly.y) / Math.max(1, topMargin) * 1.1
        if (firefly.y > bottomMargin) steerY -= (firefly.y - bottomMargin) / Math.max(1, height - bottomMargin) * 1.25

        // Ember is part of the persistent world, so fireflies can react to existing
        // heat whether or not Ember is the currently selected scene. Keep the
        // sampling local and allocation-free: a small span around the insect is
        // enough to find the nearby heat centre and steer away from it.
        if (pitchWorld.ember.length > 2 && pitchWorld.width > 0) {
          const centreIndex = worldIndexAt(firefly.x, width)
          const surfaceY = snowSurfaceYAtIndex(centreIndex, height)
          const heightAboveHeat = surfaceY - firefly.y

          if (heightAboveHeat > -18 && heightAboveHeat < 150) {
            const sampleRadius = 9
            const lastIndex = pitchWorld.ember.length - 1
            let heatWeight = 0
            let heatCentre = 0
            let peakHeat = 0

            for (let offset = -sampleRadius; offset <= sampleRadius; offset++) {
              const index = centreIndex + offset
              if (index < 0 || index > lastIndex) continue
              const heat = pitchWorld.ember[index]
              if (heat <= 0.08) continue

              const falloff = 1 - Math.abs(offset) / (sampleRadius + 1)
              const weight = (heat - 0.08) * falloff
              heatWeight += weight
              heatCentre += index * weight
              if (heat > peakHeat) peakHeat = heat
            }

            if (heatWeight > 0.015 && peakHeat > 0.12) {
              const heatIndex = heatCentre / heatWeight
              const heatX = (heatIndex / Math.max(1, lastIndex)) * width
              const dx = firefly.x - heatX
              const dy = firefly.y - surfaceY
              const distance = Math.hypot(dx, dy)
              const verticalInfluence = 1 - Math.min(1, Math.max(0, heightAboveHeat) / 150)
              const proximity = 1 - Math.min(1, distance / 145)
              const avoidance = Math.min(1.45, peakHeat * 1.05 + heatWeight * 0.12) * verticalInfluence * proximity

              if (avoidance > 0.015) {
                const invDistance = 1 / Math.max(10, distance)
                steerX += dx * invDistance * avoidance * 2.4
                steerY += dy * invDistance * avoidance * 2.8
                targetSpeed += avoidance * 5.5
              }

              // Avoidance normally wins. Very occasionally a firefly that gets
              // unusually close to intense heat fails to escape; the existing
              // brief death flash supplies the rapid brighten-and-disappear beat.
              if (
                peakHeat > 0.58 &&
                distance < 54 &&
                heightAboveHeat > -10 &&
                heightAboveHeat < 62 &&
                Math.random() < dt * (0.010 + peakHeat * 0.018)
              ) {
                firefly.dying = true
                firefly.deathStart = time
                firefly.deathDuration = 360 + Math.random() * 180
                firefly.exiting = false
                recoveryBlockedUntil = Math.max(recoveryBlockedUntil, time + 10000 + Math.random() * 8000)
                return
              }
            }
          }
        }

        targetHeading = Math.atan2(steerY, steerX)
      }

      const headingDelta = wrapAngle(targetHeading - firefly.heading)
      firefly.heading += headingDelta * Math.min(1, dt * 1.15)
      firefly.speed += (targetSpeed - firefly.speed) * Math.min(1, dt * 0.7)

      const desiredVx = Math.cos(firefly.heading) * firefly.speed
      const desiredVy = Math.sin(firefly.heading) * firefly.speed
      firefly.vx += (desiredVx - firefly.vx) * Math.min(1, dt * 1.6)
      firefly.vy += (desiredVy - firefly.vy) * Math.min(1, dt * 1.6)
      firefly.x += firefly.vx * dt
      firefly.y += firefly.vy * dt
    }

    const isFarOutside = (firefly: Firefly) => (
      firefly.x < -72 || firefly.x > width + 72 || firefly.y < -72 || firefly.y > height + 72
    )

    const draw = (time: number) => {
      raf = requestAnimationFrame(draw)
      const dt = Math.min(0.05, Math.max(0.001, (time - last) / 1000))
      last = time

      const isActive = activeRef.current
      const currentAbundance = abundanceRef.current
      if (isActive && Math.abs(currentAbundance - lastAbundance) > 0.04) {
        lastAbundance = currentAbundance
        targetPopulation = populationForWidth(width, currentAbundance)
        nextSpawn = Math.min(nextSpawn, time + 120)
      }
      if (isActive !== wasActive) {
        if (isActive) {
          targetPopulation = populationForWidth(width, abundanceRef.current)
          nextSpawn = time + 90
          for (let i = 0; i < fireflies.length; i++) {
            const firefly = fireflies[i]
            if (firefly.dying) continue
            firefly.exiting = false
            firefly.leaveAt = time + 30000 + Math.random() * 70000
            firefly.nextTurn = Math.min(firefly.nextTurn, time + 500 + Math.random() * 1200)
          }
        } else {
          targetPopulation = 0
          for (let i = 0; i < fireflies.length; i++) {
            beginExit(fireflies[i], time, Math.random() * 3600)
          }
        }
        wasActive = isActive
      }

      if (isActive && fireflies.length < targetPopulation && time >= nextSpawn && time >= recoveryBlockedUntil) {
        spawnFirefly(time)
        nextSpawn = time + 2100 + Math.random() * 1900
      }

      const render = visibleRef.current
      if (render) {
        ctx.clearRect(0, 0, width, height)
        canvasCleared = false
      } else if (!canvasCleared) {
        ctx.clearRect(0, 0, width, height)
        canvasCleared = true
      }

      for (let i = fireflies.length - 1; i >= 0; i--) {
        const firefly = fireflies[i]
        if (!firefly.dying && fireflySignal.extinguishRequests[i] === firefly.id) {
          fireflySignal.extinguishRequests[i] = 0
          firefly.dying = true
          firefly.deathStart = time
          firefly.deathDuration = 520 + Math.random() * 260
          firefly.exiting = false
          recoveryBlockedUntil = Math.max(recoveryBlockedUntil, time + 11000 + Math.random() * 10000)
        }

        updateFirefly(firefly, time, dt)
        if (render) drawFirefly(firefly, time)

        const deathFinished = firefly.dying && time >= firefly.deathStart + firefly.deathDuration
        const exitFinished = firefly.exiting && time >= firefly.exitAt && isFarOutside(firefly)
        if (deathFinished || exitFinished) {
          fireflies[i] = fireflies[fireflies.length - 1]
          fireflies.pop()
          if (isActive && exitFinished) nextSpawn = Math.max(nextSpawn, time + 900 + Math.random() * 1700)
        }
      }

      const publishedCount = Math.min(fireflies.length, fireflySignal.positions.length / 2)
      fireflySignal.count = publishedCount
      for (let i = 0; i < publishedCount; i++) {
        const firefly = fireflies[i]
        const offset = i * 2
        fireflySignal.positions[offset] = firefly.x
        fireflySignal.positions[offset + 1] = firefly.y
        fireflySignal.ids[i] = firefly.id
      }
    }

    resize()
    window.addEventListener('resize', resize)
    raf = requestAnimationFrame(draw)

    return () => {
      fireflySignal.count = 0
      fireflySignal.extinguishRequests.fill(0)
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
    }
  }, [])

  return <canvas className="scene-canvas fireflies-layer-canvas" ref={canvasRef} aria-hidden="true" />
}
