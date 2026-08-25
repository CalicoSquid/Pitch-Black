import { useEffect, useRef } from 'react'
import { getPitchAudio, getPitchAudioOutput } from '../audio/pitchAudio'
import {
  ensureWorld,
  pitchWorld,
  saveWorld,
  snowSurfaceYAtIndex,
  surfaceYAt,
  worldIndexAt,
} from '../world/worldState'

export function EmberScene({
  speed,
  soundOn,
  active,
  rainActive,
  snowActive,
  visible,
}: {
  speed: number
  soundOn: boolean
  active: boolean
  rainActive: boolean
  snowActive: boolean
  visible: boolean
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const activeRef = useRef(active)
  const rainActiveRef = useRef(rainActive)
  const snowActiveRef = useRef(snowActive)
  const soundOnRef = useRef(soundOn)
  const speedRef = useRef(speed)
  const visibleRef = useRef(visible)

  useEffect(() => {
    activeRef.current = active
  }, [active])

  useEffect(() => {
    rainActiveRef.current = rainActive
  }, [rainActive])

  useEffect(() => {
    snowActiveRef.current = snowActive
  }, [snowActive])

  useEffect(() => {
    soundOnRef.current = soundOn
  }, [soundOn])

  useEffect(() => {
    speedRef.current = speed
  }, [speed])

  useEffect(() => {
    visibleRef.current = visible
  }, [visible])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let width = window.innerWidth
    let height = window.innerHeight
    let dpr = Math.min(window.devicePixelRatio || 1, 1.5)
    let raf = 0
    let last = performance.now()
    let meteorStartedAt = -1
    let wasActive = false
    let rainMix = rainActiveRef.current ? 1 : 0
    let snowMix = snowActiveRef.current ? 1 : 0

    let targetX = 0
    let targetY = 0
    let startX = 0
    let startY = 0
    let impacted = false
    let hasIgnited = pitchWorld.ember.some((value) => value > 0.02) || pitchWorld.char.some((value) => value > 0.03)
    let impactAt = 0
    let impactIndex = 0

    let trail: Array<{ x: number; y: number; age: number }> = []
    let fragments: Array<{ x: number; y: number; vx: number; vy: number; life: number; size: number }> = []
    let sparks: Array<{ x: number; y: number; vx: number; vy: number; life: number; size: number }> = []
    let steam: Array<{ x: number; y: number; vx: number; vy: number; life: number; size: number }> = []
    let smoke: Array<{ x: number; y: number; vx: number; vy: number; life: number; size: number }> = []

    let fire = pitchWorld.ember
    let residue = pitchWorld.char
    let fireSnapshot = new Float32Array(fire.length)

    let audioCtx: AudioContext | null = null
    let whooshGain: GainNode | null = null
    let whooshSource: AudioBufferSourceNode | null = null
    let fireGain: GainNode | null = null
    let fireSource: AudioBufferSourceNode | null = null
    let lastFireLevelNode: GainNode | null = null
    let lastFireLevel = Number.NaN

    const ensureAudio = () => {
      audioCtx = getPitchAudio()
      if (audioCtx?.state === 'suspended') void audioCtx.resume()
      return audioCtx
    }

    const startWhoosh = () => {
      if (whooshSource) return
      const ac = ensureAudio()
      if (!ac) return

      const seconds = 2.8
      const buffer = ac.createBuffer(1, Math.floor(ac.sampleRate * seconds), ac.sampleRate)
      const data = buffer.getChannelData(0)
      let low = 0
      for (let i = 0; i < data.length; i++) {
        const white = Math.random() * 2 - 1
        low = low * 0.93 + white * 0.07
        data[i] = low * 0.42 + white * 0.05
      }

      const source = ac.createBufferSource()
      const filter = ac.createBiquadFilter()
      const gain = ac.createGain()
      source.buffer = buffer
      filter.type = 'bandpass'
      filter.frequency.value = 580
      filter.Q.value = 0.55
      gain.gain.value = 0

      source.connect(filter).connect(gain).connect(getPitchAudioOutput(ac))
      source.start()
      gain.gain.setTargetAtTime(0.045, ac.currentTime, 0.38)
      filter.frequency.exponentialRampToValueAtTime(1250, ac.currentTime + 1.8)

      whooshSource = source
      whooshGain = gain
      source.onended = () => {
        if (whooshSource === source) {
          whooshSource = null
          whooshGain = null
        }
      }
    }

    const impactSound = () => {
      const ac = ensureAudio()
      if (!ac) return

      if (whooshGain) whooshGain.gain.setTargetAtTime(0, ac.currentTime, 0.055)

      const osc = ac.createOscillator()
      const impactGain = ac.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(82, ac.currentTime)
      osc.frequency.exponentialRampToValueAtTime(38, ac.currentTime + 0.28)
      impactGain.gain.setValueAtTime(0.0001, ac.currentTime)
      impactGain.gain.exponentialRampToValueAtTime(0.17, ac.currentTime + 0.012)
      impactGain.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 0.42)
      osc.connect(impactGain).connect(getPitchAudioOutput(ac))
      osc.start()
      osc.stop(ac.currentTime + 0.46)

      const buffer = ac.createBuffer(1, Math.floor(ac.sampleRate * 0.32), ac.sampleRate)
      const data = buffer.getChannelData(0)
      for (let i = 0; i < data.length; i++) {
        const envelope = Math.exp(-i / (ac.sampleRate * 0.052))
        data[i] = (Math.random() * 2 - 1) * envelope
      }
      const source = ac.createBufferSource()
      const filter = ac.createBiquadFilter()
      const gain = ac.createGain()
      source.buffer = buffer
      filter.type = 'lowpass'
      filter.frequency.value = 850
      gain.gain.value = 0.055
      source.connect(filter).connect(gain).connect(getPitchAudioOutput(ac))
      source.start()
    }

    const syncFireSound = () => {
      if (!soundOnRef.current || !hasIgnited) {
        if (fireGain && audioCtx) fireGain.gain.setTargetAtTime(0, audioCtx.currentTime, 0.24)
        return
      }

      const ac = ensureAudio()
      if (!ac) return
      if (fireSource) return

      const seconds = 4
      const buffer = ac.createBuffer(1, Math.floor(ac.sampleRate * seconds), ac.sampleRate)
      const data = buffer.getChannelData(0)
      let low = 0
      for (let i = 0; i < data.length; i++) {
        const white = Math.random() * 2 - 1
        low = low * 0.955 + white * 0.045
        const pop = Math.random() > 0.9989 ? (Math.random() * 2 - 1) * 0.7 : 0
        data[i] = low * 0.28 + white * 0.018 + pop
      }

      const source = ac.createBufferSource()
      const filter = ac.createBiquadFilter()
      const gain = ac.createGain()
      source.buffer = buffer
      source.loop = true
      filter.type = 'lowpass'
      filter.frequency.value = 1800
      gain.gain.value = 0
      source.connect(filter).connect(gain).connect(getPitchAudioOutput(ac))
      source.start()
      fireSource = source
      fireGain = gain
    }

    const seeded = (i: number) => {
      const n = Math.sin(i * 12.9898 + 78.233) * 43758.5453
      return n - Math.floor(n)
    }

    const ensureFields = () => {
      fire = pitchWorld.ember
      residue = pitchWorld.char
      if (fireSnapshot.length !== fire.length) fireSnapshot = new Float32Array(fire.length)
    }

    const chooseTrajectory = () => {
      targetX = width * (0.28 + Math.random() * 0.44)
      targetY = surfaceYAt(targetX, width, height)

      const fromLeft = Math.random() > 0.5
      const horizontalDistance = width * (0.28 + Math.random() * 0.18)
      startX = targetX + (fromLeft ? -horizontalDistance : horizontalDistance)
      startX = Math.max(width * 0.08, Math.min(width * 0.92, startX))
      startY = 10 + Math.random() * Math.min(22, height * 0.025)
    }

    const spawnSteam = (index: number, amount: number) => {
      if (amount <= 0.010) return
      const x = Math.min(width, index * 6) + (Math.random() - 0.5) * 8
      const y = snowSurfaceYAtIndex(index, height) - 2
      const count = Math.min(4, Math.max(1, Math.round(amount * 12)))
      for (let i = 0; i < count; i++) {
        steam.push({
          x: x + (Math.random() - 0.5) * 4,
          y: y - Math.random() * 2,
          vx: (Math.random() - 0.5) * 0.10,
          vy: -(0.12 + Math.random() * 0.18),
          life: 0.85 + Math.random() * 0.70,
          size: 2.2 + Math.random() * 3.8,
        })
      }
      if (steam.length > 220) {
        const excess = steam.length - 220
        steam.copyWithin(0, excess)
        steam.length = 220
      }
    }

    const spawnSmoke = (index: number, strength: number) => {
      if (strength <= 0.12) return
      const x = Math.min(width, index * 6) + (Math.random() - 0.5) * 6
      const y = snowSurfaceYAtIndex(index, height) - 4
      smoke.push({
        x,
        y,
        vx: (Math.random() - 0.5) * 0.08,
        vy: -(0.08 + Math.random() * 0.14),
        life: 0.75 + Math.random() * 0.90,
        size: 4 + strength * 8 + Math.random() * 5,
      })
      if (smoke.length > 180) {
        const excess = smoke.length - 180
        smoke.copyWithin(0, excess)
        smoke.length = 180
      }
    }

    const spawnSpark = (index: number, strength: number, count = 1) => {
      if (strength < 0.28) return
      const x = Math.min(width, index * 6) + (Math.random() - 0.5) * 6
      const y = snowSurfaceYAtIndex(index, height) - 2
      for (let i = 0; i < count; i++) {
        const lift = Math.max(0, strength - 0.35)
        sparks.push({
          x: x + (Math.random() - 0.5) * 3.4,
          y: y - Math.random() * 1.8,
          vx: (Math.random() - 0.5) * (0.42 + lift * 0.18),
          vy: -(0.72 + Math.random() * 1.02 + lift * (0.18 + Math.random() * 0.24)),
          life: 0.36 + Math.random() * 0.34 + lift * Math.random() * 0.10,
          size: 0.85 + Math.random() * 1.08,
        })
      }
      if (sparks.length > 195) {
        const excess = sparks.length - 195
        sparks.copyWithin(0, excess)
        sparks.length = 195
      }
    }

    const resize = () => {
      width = window.innerWidth
      height = window.innerHeight
      dpr = Math.min(window.devicePixelRatio || 1, 1.5)
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ensureWorld(width, height)
      ensureFields()
    }

    const beginMeteor = (time: number) => {
      if (whooshSource) {
        try { whooshSource.stop() } catch { /* already finished */ }
        whooshSource = null
        whooshGain = null
      }
      meteorStartedAt = time
      impacted = false
      trail = []
      fragments = []
      chooseTrajectory()
    }

    const applyImpact = (time: number) => {
      if (impacted) return
      impacted = true
      hasIgnited = true
      impactAt = time
      impactIndex = worldIndexAt(targetX, width)

      const impactRadius = 10
      for (let offset = -impactRadius; offset <= impactRadius; offset++) {
        const idx = impactIndex + offset
        if (idx <= 1 || idx >= pitchWorld.drifts.length - 2) continue
        const normalized = Math.abs(offset) / impactRadius
        const strength = Math.max(0, 1 - normalized * normalized)

        pitchWorld.drifts[idx] = Math.max(0, pitchWorld.drifts[idx] - 3.8 * strength)
        pitchWorld.water[idx] = Math.max(0, pitchWorld.water[idx] * (1 - strength * 0.76))
        residue[idx] = Math.max(residue[idx], strength * 0.24)
      }

      targetY = surfaceYAt(targetX, width, height)

      for (let offset = -2; offset <= 2; offset++) {
        const idx = impactIndex + offset
        if (idx > 0 && idx < fire.length - 1) fire[idx] = Math.max(fire[idx], 0.85 - Math.abs(offset) * 0.12)
      }

      fragments = Array.from({ length: 18 }, () => {
        const angle = Math.PI * (1.08 + Math.random() * 0.84)
        const force = 1.6 + Math.random() * 4.8
        return {
          x: targetX,
          y: targetY - 3,
          vx: Math.cos(angle) * force,
          vy: Math.sin(angle) * force - 1.2,
          life: 0.55 + Math.random() * 0.65,
          size: 0.7 + Math.random() * 1.5,
        }
      })

      for (let k = 0; k < 10; k++) spawnSpark(impactIndex + Math.floor((Math.random() - 0.5) * 3), 1)

      impactSound()
      syncFireSound()
      saveWorld()
    }

    const updateFire = (time: number, dt: number) => {
      if (!hasIgnited) return
      ensureFields()

      const scaled = (dt / 16.67) * speedRef.current
      fireSnapshot.set(fire)
      const previous = fireSnapshot
      fire[0] = 0
      fire[fire.length - 1] = 0
      let totalHeat = 0
      const impactAge = (time - impactAt) / 1000

      // Keep an ignition source alive briefly at the strike point.
      if (impactAge < 4.2) {
        for (let offset = -3; offset <= 3; offset++) {
          const idx = impactIndex + offset
          if (idx <= 0 || idx >= previous.length - 1) continue
          const strength = Math.max(0, 1 - Math.abs(offset) / 4)
          previous[idx] = Math.max(previous[idx], 0.72 * strength + Math.max(0, 0.35 - impactAge * 0.08))
        }
      }

      for (let i = 1; i < previous.length - 1; i++) {
        const here = previous[i]
        const neighbor = Math.max(previous[i - 1], previous[i + 1])
        const randomBias = 0.97 + seeded(i) * 0.035
        const snow = pitchWorld.drifts[i]
        const water = pitchWorld.water[i]
        const moisture = Math.min(0.82, snow * 0.018 + water * 0.070)

        let heat = here * Math.pow(0.9965, scaled)
        const weatherSuppression = rainMix * 0.105 + snowMix * 0.058
        const spread = neighbor * (0.985 + randomBias * 0.007 - moisture * 0.070 - weatherSuppression)
        heat = Math.max(heat, spread)

        if (neighbor > 0.20 && residue[i] > 0.05) {
          heat = Math.max(heat, neighbor * (0.986 + randomBias * 0.004))
        }

        if (residue[i] > 0.20) {
          heat = Math.max(heat, residue[i] * 0.16)
        }

        heat *= 1 - Math.min(0.32, moisture * 0.18)

        // Incoming rain/snow cools the persistent fire rather than replacing it.
        const weatherScale = dt / 16.67
        const cooling =
          rainMix * 0.0028 * weatherScale +
          snowMix * 0.0014 * weatherScale
        const cooled = Math.min(heat, cooling * (0.72 + seeded(i * 5) * 0.42))
        if (cooled > 0) {
          heat -= cooled
          if (Math.random() < Math.min(0.18, cooled * 18)) {
            spawnSteam(i, cooled * (rainMix > snowMix ? 12 : 9))
          }
        }

        residue[i] = Math.max(
          0,
          residue[i] -
            (rainMix * 0.00115 + snowMix * 0.00058) * weatherScale
        )

        heat = Math.max(0, Math.min(1, heat))
        fire[i] = heat
        totalHeat += fire[i]

        if (heat > 0.06) {
          residue[i] = Math.min(1, residue[i] + heat * 0.0032 * scaled)

          const melt = Math.min(pitchWorld.drifts[i], heat * 0.065 * scaled)
          if (melt > 0) {
            pitchWorld.drifts[i] = Math.max(0, pitchWorld.drifts[i] - melt)
            spawnSteam(i, melt)
          }

          const evap = Math.min(pitchWorld.water[i], heat * 0.038 * scaled)
          if (evap > 0) {
            pitchWorld.water[i] = Math.max(0, pitchWorld.water[i] - evap)
            spawnSteam(i, evap * 1.35)
          }

          if (heat > 0.34 && Math.random() < 0.0195 * scaled) spawnSpark(i, heat)
          if (heat > 0.62 && Math.random() < 0.0022 * scaled) {
            spawnSpark(i, heat, 2 + Math.floor(Math.random() * 3))
          }
          if ((heat > 0.20 || residue[i] > 0.34) && Math.random() < 0.010 * scaled) {
            spawnSmoke(i, Math.max(heat, residue[i] * 0.8))
          }
        } else {
          residue[i] = Math.max(0, residue[i] - 0.00018 * scaled)
          if (residue[i] > 0.28 && Math.random() < 0.004 * scaled) {
            spawnSmoke(i, residue[i] * 0.7)
          }
        }
      }

      pitchWorld.ember = fire
      pitchWorld.char = residue

      pitchWorld.wetness = Math.max(
        0,
        pitchWorld.wetness - 0.0005 * scaled * Math.max(0.15, 1 - rainMix)
      )

      if (fireGain && audioCtx) {
        const level = soundOnRef.current ? Math.min(0.085, 0.018 + totalHeat / fire.length * 0.18) : 0
        if (fireGain !== lastFireLevelNode) {
          lastFireLevelNode = fireGain
          lastFireLevel = Number.NaN
        }
        if (level !== lastFireLevel) {
          fireGain.gain.setTargetAtTime(level, audioCtx.currentTime, 0.25)
          lastFireLevel = level
        }
      } else {
        lastFireLevelNode = null
        lastFireLevel = Number.NaN
      }
    }

    const drawMeteor = (time: number, render: boolean) => {
      if (meteorStartedAt < 0 || impacted) return

      const elapsed = time - meteorStartedAt
      const fallDuration = 2250 / Math.min(1.35, 0.92 + Math.sqrt(speedRef.current) * 0.08)

      startWhoosh()

      const raw = Math.min(1, elapsed / fallDuration)
      const t = raw * (0.34 + raw * 0.66)
      const x = startX + (targetX - startX) * t
      const y = startY + (targetY - startY) * t

      trail.push({ x, y, age: time })
      if (trail.length > 16) {
        trail.copyWithin(0, trail.length - 16)
        trail.length = 16
      }

      if (render) {
        for (let i = 0; i < trail.length; i++) {
          const point = trail[i]
          const age = Math.min(1, (time - point.age) / 460)
          const alpha = (1 - age) * (0.05 + raw * 0.20) * (i / trail.length)
          const radius = 0.8 + (i / trail.length) * (1.5 + raw * 1.6)
          ctx.beginPath()
          ctx.arc(point.x, point.y, radius, 0, Math.PI * 2)
          ctx.fillStyle = `rgba(191, 92, 39, ${alpha})`
          ctx.fill()
        }

        ctx.beginPath()
        ctx.arc(x, y, 2.2 + raw * 2.6, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(165, 65, 25, ${0.34 + raw * 0.28})`
        ctx.fill()

        ctx.beginPath()
        ctx.arc(x, y, 1.15 + raw * 1.25, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(238, 151, 82, ${0.58 + raw * 0.30})`
        ctx.fill()

        ctx.beginPath()
        ctx.arc(x - 0.4, y - 0.4, 0.65 + raw * 0.45, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(255, 224, 176, ${0.70 + raw * 0.24})`
        ctx.fill()

        if (raw > 0.72) {
          const warmth = (raw - 0.72) / 0.28
          const groundWidth = 24 + warmth * 80
          ctx.fillStyle = `rgba(118, 42, 18, ${warmth * 0.042})`
          ctx.fillRect(targetX - groundWidth / 2, targetY - 2, groundWidth, 4)
        }
      }

      if (raw >= 1) applyImpact(time)
    }

    const drawImpact = (time: number, dt: number, render: boolean) => {
      if (!impacted) return
      const age = (time - impactAt) / 1000

      if (render && age < 0.11) {
        const flash = 1 - age / 0.11
        ctx.fillStyle = `rgba(216, 154, 101, ${flash * 0.065})`
        ctx.fillRect(0, 0, width, height)
      }

      for (const fragment of fragments) {
        if (fragment.life <= 0) continue
        fragment.vy += 0.11 * (dt / 16.67)
        fragment.x += fragment.vx * (dt / 16.67)
        fragment.y += fragment.vy * (dt / 16.67)
        fragment.life -= 0.018 * (dt / 16.67)

        if (render) {
          ctx.fillStyle = `rgba(224, 91, 35, ${Math.max(0, fragment.life) * 0.52})`
          ctx.fillRect(fragment.x, fragment.y, fragment.size, fragment.size)
        }
      }
    }

    const drawFire = (time: number, dt: number, render: boolean) => {
      const t = time * 0.001

      if (render) for (let i = 1; i < fire.length - 1; i++) {
        const heat = fire[i]
        const char = residue[i]
        if (heat < 0.02 && char < 0.03) continue

        const x = Math.min(width, i * 6)
        const surface = snowSurfaceYAtIndex(i, height)

        if (char > 0.04) {
          ctx.beginPath()
          ctx.ellipse(x, surface + 1.6, 4.8 + char * 3.6, 2.2 + char * 2.6, 0, 0, Math.PI * 2)
          ctx.fillStyle = `rgba(17, 8, 7, ${Math.min(0.42, 0.10 + char * 0.24)})`
          ctx.fill()
        }

        if (heat > 0.025) {
          // Soft terrain-hugging glow instead of obvious vertical red bars.
          ctx.beginPath()
          ctx.ellipse(x, surface - 0.8, 5.2 + heat * 5.5, 2.4 + heat * 2.6, 0, 0, Math.PI * 2)
          ctx.fillStyle = `rgba(108, 26, 11, ${Math.min(0.26, heat * 0.18 + char * 0.08)})`
          ctx.fill()

          ctx.beginPath()
          ctx.ellipse(x, surface - 0.7, 2.4 + heat * 2.6, 1.0 + heat * 0.85, 0, 0, Math.PI * 2)
          ctx.fillStyle = `rgba(231, 102, 38, ${Math.min(0.56, heat * 0.36 + char * 0.10)})`
          ctx.fill()

          const frontness = Math.max(0, heat - residue[i] * 0.18)
          if (frontness > 0.12 && i % 2 === 0) {
            const flicker = 0.78 + Math.sin(t * 7.0 + i * 0.8) * 0.14 + seeded(i) * 0.10
            const flameH = 5.5 + frontness * 16 * flicker
            const flameW = 3.2 + frontness * 3.4

            // Rounder, broader early flame front — less pointy, more terrain-hugging.
            ctx.beginPath()
            ctx.moveTo(x - flameW, surface)
            ctx.bezierCurveTo(
              x - flameW * 0.95, surface - flameH * 0.28,
              x - flameW * 0.40, surface - flameH * 0.86,
              x, surface - flameH * 0.82
            )
            ctx.bezierCurveTo(
              x + flameW * 0.40, surface - flameH * 0.86,
              x + flameW * 0.95, surface - flameH * 0.30,
              x + flameW, surface
            )
            ctx.closePath()
            ctx.fillStyle = `rgba(236, 104, 39, ${Math.min(0.40, frontness * 0.34)})`
            ctx.fill()

            ctx.beginPath()
            ctx.moveTo(x - flameW * 0.52, surface - 0.3)
            ctx.bezierCurveTo(
              x - flameW * 0.35, surface - flameH * 0.24,
              x - flameW * 0.12, surface - flameH * 0.62,
              x, surface - flameH * 0.60
            )
            ctx.bezierCurveTo(
              x + flameW * 0.12, surface - flameH * 0.62,
              x + flameW * 0.35, surface - flameH * 0.26,
              x + flameW * 0.50, surface - 0.3
            )
            ctx.closePath()
            ctx.fillStyle = `rgba(255, 181, 97, ${Math.min(0.20, frontness * 0.16)})`
            ctx.fill()
          }
        }

        // Cooling char keeps a faint buried afterglow after the active front has passed.
        if (char > 0.065 && heat < 0.20) {
          const cooling = Math.max(0, 1 - heat / 0.20)
          const glowPulse = 0.82 + Math.sin(t * 1.35 + i * 0.57) * 0.10 + seeded(i * 7) * 0.08
          const glowAlpha = Math.min(0.17, (0.018 + char * 0.12) * cooling * glowPulse)

          ctx.beginPath()
          ctx.ellipse(
            x + (seeded(i * 13) - 0.5) * 1.8,
            surface - 0.25,
            1.25 + char * 2.1,
            0.42 + char * 0.52,
            0,
            0,
            Math.PI * 2
          )
          ctx.fillStyle = `rgba(132, 39, 18, ${glowAlpha})`
          ctx.fill()

          if (char > 0.12 && seeded(i * 17) > 0.62) {
            ctx.beginPath()
            ctx.ellipse(
              x + (seeded(i * 19) - 0.5) * 2.2,
              surface - 0.45,
              0.55 + char * 0.75,
              0.30 + char * 0.24,
              0,
              0,
              Math.PI * 2
            )
            ctx.fillStyle = `rgba(205, 70, 27, ${Math.min(0.15, glowAlpha * 1.35)})`
            ctx.fill()
          }
        }

        // Hot ember bed lingers behind the front.
        if (char > 0.18) {
          const pulse = 0.80 + Math.sin(t * 4.6 + i * 0.83) * 0.18 + seeded(i) * 0.10

          // Brighter continuous fire line in the late ember state.
          ctx.beginPath()
          ctx.ellipse(x, surface - 0.6, 2.0 + char * 1.8, 0.65 + char * 0.35, 0, 0, Math.PI * 2)
          ctx.fillStyle = `rgba(247, 116, 46, ${Math.min(0.44, char * 0.22 * pulse)})`
          ctx.fill()

          ctx.beginPath()
          ctx.ellipse(x + (seeded(i * 3) - 0.5) * 2, surface - 0.4, 1.3 + char * 1.5, 0.60 + char * 0.48, 0, 0, Math.PI * 2)
          ctx.fillStyle = `rgba(255, 124, 58, ${Math.min(0.72, char * 0.40 * pulse)})`
          ctx.fill()

          if (char > 0.35 && i % 3 === 0) {
            ctx.fillStyle = `rgba(255, 189, 106, ${Math.min(0.30, char * 0.18 * pulse)})`
            ctx.fillRect(x - 0.6, surface - 1.25, 1.5, 0.82)
          }
        }
      }

      for (const particle of sparks) {
        if (particle.life <= 0) continue
        particle.x += particle.vx * (dt / 16.67)
        particle.y += particle.vy * (dt / 16.67)
        particle.vy += 0.018 * (dt / 16.67)
        particle.life -= 0.015 * (dt / 16.67)

        if (render) {
          ctx.fillStyle = `rgba(241, 121, 46, ${Math.max(0, particle.life) * 0.72})`
          ctx.fillRect(particle.x, particle.y, particle.size, particle.size)
        }
      }

      for (const plume of steam) {
        if (plume.life <= 0) continue
        plume.x += plume.vx * (dt / 16.67)
        plume.y += plume.vy * (dt / 16.67)
        plume.vx += Math.sin(t * 2.2 + plume.y * 0.03) * 0.002
        plume.life -= 0.0065 * (dt / 16.67)

        if (render) {
          ctx.beginPath()
          ctx.ellipse(plume.x, plume.y, plume.size, plume.size * 0.42, 0, 0, Math.PI * 2)
          ctx.fillStyle = `rgba(188, 193, 198, ${Math.max(0, plume.life) * 0.032})`
          ctx.fill()
        }
      }

      for (const plume of smoke) {
        if (plume.life <= 0) continue
        plume.x += plume.vx * (dt / 16.67)
        plume.y += plume.vy * (dt / 16.67)
        plume.vx += Math.sin(t * 1.6 + plume.y * 0.02) * 0.0015
        plume.life -= 0.0048 * (dt / 16.67)

        if (render) {
          ctx.beginPath()
          ctx.ellipse(plume.x, plume.y, plume.size, plume.size * 0.58, 0, 0, Math.PI * 2)
          ctx.fillStyle = `rgba(70, 62, 58, ${Math.max(0, plume.life) * 0.040})`
          ctx.fill()
        }
      }
    }

    resize()
    syncFireSound()
    raf = requestAnimationFrame(function draw(time) {
      const dt = Math.min(34, time - last)
      last = time

      const transitionBlend = 1 - Math.exp(-dt / 900)
      rainMix += ((rainActiveRef.current ? 1 : 0) - rainMix) * transitionBlend
      snowMix += ((snowActiveRef.current ? 1 : 0) - snowMix) * transitionBlend

      const isActive = activeRef.current
      if (isActive && !wasActive) beginMeteor(time)
      wasActive = isActive

      syncFireSound()
      updateFire(time, dt)

      const render = visibleRef.current
      if (render) ctx.clearRect(0, 0, width, height)
      drawMeteor(time, render)
      drawImpact(time, dt, render)
      drawFire(time, dt, render)

      raf = requestAnimationFrame(draw)
    })

    window.addEventListener('resize', resize)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
      if (whooshGain && audioCtx) whooshGain.gain.setTargetAtTime(0, audioCtx.currentTime, 0.05)
      if (fireGain && audioCtx) fireGain.gain.setTargetAtTime(0, audioCtx.currentTime, 0.18)
      try { whooshSource?.stop() } catch { /* already finished */ }
      try { fireSource?.stop() } catch { /* already finished */ }
    }
  }, [])

  return (
    <div className="ember-scene">
      <canvas className="scene-canvas" ref={canvasRef} aria-label="Meteor impact and spreading ember fire scene" />
    </div>
  )
}


